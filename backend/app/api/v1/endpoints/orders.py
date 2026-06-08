from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func, update

from app.db.session import get_db
from app.db.models.order import Order, OrderItem
from app.db.models.product import Product
from app.schemas.order import OrderIn, OrderOut

router = APIRouter(prefix="/orders", tags=["Orders"])


def _next_order_number(db: Session) -> str:
    """Возвращает следующий человекочитаемый номер заказа.

    Args:
        db: Сессия БД.

    Returns:
        Номер вида ``ORD-0001`` (по количеству заказов в БД + 1).
    """
    count = db.scalar(select(func.count()).select_from(Order)) or 0
    return f"ORD-{count + 1:04d}"


@router.post("", response_model=OrderOut, status_code=201)
def create_order(payload: OrderIn, db: Session = Depends(get_db)):
    """Создаёт заказ из корзины и ставит фоновую отправку в МойСклад.

    Цена каждой позиции берётся из БД (а не из запроса) — клиент не может её подделать.
    Заказ сохраняется синхронно, а отправка в МойСклад уходит в Celery, чтобы покупатель
    не ждал ответа от внешнего API.

    Args:
        payload: Данные покупателя и список позиций (``product_id`` + ``quantity``).
        db: Сессия БД.

    Returns:
        Созданный заказ (:class:`OrderOut`) со статусом ``new`` и номером ``ORD-XXXX``.

    Raises:
        HTTPException: 422, если хотя бы один ``product_id`` не найден в БД.
        HTTPException: 409, если на складе не хватает остатка хотя бы по одной позиции
            (тело содержит ``items`` со списком товаров и их доступным количеством).
    """
    # Загружаем товары одним запросом
    product_ids = [i.product_id for i in payload.items]
    products = {
        p.id: p
        for p in db.scalars(select(Product).where(Product.id.in_(product_ids)))
    }

    # Проверяем что все товары существуют
    missing = [pid for pid in product_ids if pid not in products]
    if missing:
        raise HTTPException(status_code=422, detail=f"Товары не найдены: {missing}")

    # Резервируем остаток атомарно: UPDATE ... WHERE stock >= qty. Если строк не
    # обновилось (rowcount == 0) — товара не хватает. Условие в самом UPDATE защищает
    # от oversell, в т.ч. от гонки двух одновременных заказов за последнюю единицу
    # (выиграет только один). Всё в одной транзакции с созданием заказа — либо списываем
    # остаток И создаём заказ, либо ничего (rollback).
    insufficient = []
    for item_in in payload.items:
        result = db.execute(
            update(Product)
            .where(Product.id == item_in.product_id, Product.stock >= item_in.quantity)
            .values(stock=Product.stock - item_in.quantity)
        )
        if result.rowcount == 0:
            insufficient.append(item_in.product_id)

    if insufficient:
        db.rollback()
        # после rollback читаем актуальный остаток — для понятного сообщения покупателю
        rows = db.scalars(select(Product).where(Product.id.in_(insufficient))).all()
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Недостаточно товара на складе",
                "items": [{"product_id": p.id, "name": p.name, "available": p.stock} for p in rows],
            },
        )

    # Считаем сумму и собираем позиции
    order_items = []
    total = 0
    for item_in in payload.items:
        product = products[item_in.product_id]
        subtotal = product.price * item_in.quantity
        total += subtotal
        order_items.append(OrderItem(
            product_id=product.id,
            product_name=product.name,
            product_article=product.article,
            price=product.price,
            quantity=item_in.quantity,
        ))

    order = Order(
        number=_next_order_number(db),
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        customer_email=payload.customer_email,
        delivery_address=payload.delivery_address,
        comment=payload.comment,
        total_amount=total,
        items=order_items,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    # Уведомление владельцу — фоном (заказ в МойСклад уезжает не отсюда: МойСклад сам
    # забирает заказы через обмен CommerceML, см. exchange.py mode=query).
    from app.tasks.notify import notify_new_order
    notify_new_order.delay(order.id)

    return order

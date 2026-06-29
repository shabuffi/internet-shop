from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.core.config import settings
from app.db.session import get_db
from app.db.models.order import Order, OrderItem
from app.db.models.product import Product
from app.db.models.user import User
from app.schemas.order import OrderIn, OrderOut
from app.services.pricing import adjusted_price
from app.api.v1.endpoints.auth import get_optional_user

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
def create_order(payload: OrderIn, db: Session = Depends(get_db),
                 user: User | None = Depends(get_optional_user)):
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

    # Остаток НЕ списываем и не считаем: количество на сайте не меняется от заказов.
    # Наличие товара управляется флагом `available` (вручную в админке), а не количеством.

    # Считаем сумму и собираем позиции. Цена — витринная (с наценкой/скидкой), а не
    # базовая из МойСклад: в заказ и в выгрузку идёт фактическая цена, которую платит
    # клиент. Считается на бэке из БД (клиент её не передаёт и не может подделать).
    # Цена по корректировке покупателя: вошедший — его персональная скидка, гость — наценка.
    percent = user.discount_percent if user is not None else None
    order_items = []
    total = Decimal("0")
    for item_in in payload.items:
        product = products[item_in.product_id]
        unit_price = adjusted_price(product.price, percent)
        subtotal = unit_price * item_in.quantity
        total += subtotal
        order_items.append(OrderItem(
            product_id=product.id,
            product_name=product.name,
            product_article=product.article,
            price=unit_price,
            quantity=item_in.quantity,
        ))

    # Минимальная сумма заказа — защита от обхода фронтенда (там кнопка уже задизейблена).
    if total < settings.MIN_ORDER_AMOUNT:
        raise HTTPException(
            status_code=422,
            detail=f"Минимальная сумма заказа — {settings.MIN_ORDER_AMOUNT:,} ₽".replace(",", " "),
        )

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

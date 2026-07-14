from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import select, text

from app.core.config import settings
from app.core.rate_limit import rate_limit, client_ip
from app.db.session import get_db
from app.db.models.order import Order, OrderItem
from app.db.models.product import Product
from app.db.models.user import User
from app.schemas.order import OrderIn, OrderOut
from app.services.pricing import adjusted_price
from app.api.v1.endpoints.auth import get_optional_user

router = APIRouter(prefix="/orders", tags=["Orders"])


def _next_order_number(db: Session) -> str:
    """Возвращает следующий человекочитаемый номер заказа вида ``ORD-0001``.

    Использует атомарный Postgres-sequence ``order_number_seq`` (``nextval``) — безопасно
    при нескольких воркерах и параллельных запросах, без блокировок приложения. Возможны
    пропуски в нумерации при откате транзакции (номерам нужна только уникальность).

    На не-Postgres (SQLite в тестах) sequence недоступен — используется фолбэк ``MAX+1``.
    Прод всегда на Postgres, поэтому боевой путь — race-free; фолбэк нужен только тестам.

    Args:
        db: Сессия БД.

    Returns:
        Номер вида ``ORD-0001``.
    """
    if db.get_bind().dialect.name == "postgresql":
        n = db.execute(text("SELECT nextval('order_number_seq')")).scalar()
    else:
        maxnum = db.execute(
            text("SELECT COALESCE(MAX(CAST(SUBSTR(number, 5) AS INTEGER)), 0) FROM orders")
        ).scalar() or 0
        n = int(maxnum) + 1
    return f"ORD-{n:04d}"


@router.post("", response_model=OrderOut, status_code=201)
def create_order(payload: OrderIn, request: Request, db: Session = Depends(get_db),
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
    # Защита от спама заказами: не более 10 оформлений за 10 минут с одного IP.
    rate_limit(f"rl:order:{client_ip(request)}", limit=10, window_sec=600)

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

    # Данные заказчика: из кабинета (профиль вошедшего) либо из гостевой формы.
    # Заказ из кабинета → в МойСклад уйдут данные заказчика из профиля.
    if user is not None:
        cust_name, cust_phone, cust_email = user.customer_name, user.phone, user.email
        cust_type, cust_inn = user.customer_type, user.inn
    else:
        cust_name, cust_phone, cust_email = payload.customer_name, payload.customer_phone, payload.customer_email
        cust_type, cust_inn = payload.customer_type, payload.customer_inn

    order = Order(
        number=_next_order_number(db),
        customer_name=cust_name,
        customer_phone=cust_phone,
        customer_email=cust_email,
        customer_type=cust_type,
        customer_inn=cust_inn,
        delivery_address=payload.delivery_address,
        delivery_method=payload.delivery_method,
        comment=payload.comment,
        total_amount=total,
        user_id=user.id if user is not None else None,
        items=order_items,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    # Уведомление владельцу — фоном (заказ в МойСклад уезжает не отсюда: МойСклад сам
    # забирает заказы через обмен CommerceML, см. exchange.py mode=query).
    from app.tasks.notify import notify_new_order, notify_order_confirmation
    notify_new_order.delay(order.id)
    # Письмо-подтверждение покупателю (если оставил email) — тоже фоном.
    try:
        notify_order_confirmation.delay(order.id)
    except Exception:
        pass

    return order

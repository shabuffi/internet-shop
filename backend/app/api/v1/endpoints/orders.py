from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.db.session import get_db
from app.db.models.order import Order, OrderItem
from app.db.models.product import Product
from app.schemas.order import OrderIn, OrderOut

router = APIRouter(prefix="/orders", tags=["Orders"])


def _next_order_number(db: Session) -> str:
    count = db.scalar(select(func.count()).select_from(Order)) or 0
    return f"ORD-{count + 1:04d}"


@router.post("", response_model=OrderOut, status_code=201)
def create_order(payload: OrderIn, db: Session = Depends(get_db)):
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
    return order

import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # Номер заказа для показа клиенту: ORD-0001
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)

    # Данные покупателя
    customer_name: Mapped[str] = mapped_column(String(255))
    customer_phone: Mapped[str] = mapped_column(String(50))
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    delivery_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Итого
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)

    # Статус: new → confirmed → shipped → delivered / cancelled
    status: Mapped[str] = mapped_column(String(50), default="new")

    # ID заказа в МойСклад (заполняется после синхронизации)
    moysklad_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Когда заказ выгружен в МойСклад через обмен CommerceML (МойСклад сам забирает
    # заказы). NULL — ещё не выгружен; ставится при подтверждении выгрузки (mode=success).
    exported_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    items: Mapped[list["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[str] = mapped_column(String(36), ForeignKey("orders.id"))
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"))

    # Сохраняем название и цену на момент заказа — товар может измениться потом
    product_name: Mapped[str] = mapped_column(String(500))
    product_article: Mapped[str | None] = mapped_column(String(100), nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    quantity: Mapped[int] = mapped_column(Integer, default=1)

    order: Mapped["Order"] = relationship("Order", back_populates="items")

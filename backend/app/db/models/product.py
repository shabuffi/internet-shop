import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


class Category(Base):
    """Группы товаров из МойСклад (дерево категорий)."""
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    moysklad_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    parent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("categories.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    products: Mapped[list["Product"]] = relationship("Product", back_populates="category")
    children: Mapped[list["Category"]] = relationship("Category")


class Product(Base):
    """Товар из МойСклад."""
    __tablename__ = "products"

    # Внутренний UUID нашей БД
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # UUID товара в МойСклад — уникален, по нему обновляем товар при синхронизации
    moysklad_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)

    name: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    code: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    article: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    # Цена в рублях (МойСклад хранит в копейках — делим на 100 при импорте)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)

    # Остатки
    stock: Mapped[int] = mapped_column(Integer, default=0)

    category_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("categories.id"), nullable=True)
    category: Mapped["Category | None"] = relationship("Category", back_populates="products")

    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class SyncLog(Base):
    """Лог каждой синхронизации с МойСклад."""
    __tablename__ = "sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(50))   # "commerceml" или "rest_api"
    status: Mapped[str] = mapped_column(String(20))    # "success" / "error"
    products_created: Mapped[int] = mapped_column(Integer, default=0)
    products_updated: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

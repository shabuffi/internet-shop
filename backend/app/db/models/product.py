import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey, JSON, func
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
    # Ид товара из выгрузки CommerceML — уникален, по нему обновляем товар при импорте
    # и сопоставляем позиции при выгрузке заказов в МойСклад (Коды связи: уникальные для магазина).
    moysklad_id: Mapped[str] = mapped_column(String(36), unique=True, index=True)

    name: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    code: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    article: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    # Цена в рублях (МойСклад хранит в копейках — делим на 100 при импорте)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)

    # Остаток из МойСклад (для справки; на наличие/заказы НЕ влияет — см. available)
    stock: Mapped[int] = mapped_column(Integer, default=0)

    category_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("categories.id"), nullable=True)
    category: Mapped["Category | None"] = relationship("Category", back_populates="products")

    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Все картинки товара (имена файлов в медиа-хранилище). image_url — первая из них.
    images: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    # Характеристики из МойСклад: список {"name", "value"} (реквизиты, кроме технических).
    attributes: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Картинки заданы вручную в админке сайта — обмен МойСклад их не перезаписывает
    images_manual: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Наличие товара — управляется вручную в админке (НЕ зависит от количества/остатка)
    available: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Флаги из МойСклад (доп-поля «Новинка»/«Распродажа»/«Убойные цены»). Проставляются при обмене;
    # в каталоге сортируем убойные → новинки → спецпредложения → остальные и фильтруем по ним.
    is_new: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)
    is_sale: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)
    is_hot: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)
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
    # Дельта-выгрузка (<Каталог СодержитТолькоИзменения="true">) или полный каталог
    changes_only: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Сколько товаров было в import.xml этого обмена (не путать с созданными/обновлёнными)
    products_in_xml: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Имя файла с сохранённой копией import.xml (media/sync_xml/<id>.xml); None — копии нет
    xml_file: Mapped[str | None] = mapped_column(String(255), nullable=True)


class SyncChange(Base):
    """Что случилось с ОДНИМ товаром в рамках ОДНОГО обмена.

    Пишется прямо во время :func:`app.services.import_service.upsert_catalog` — из тех же
    данных, по которым принимаются решения (второго прохода по товарам нет).
    """
    __tablename__ = "sync_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sync_log_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("sync_logs.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )
    moysklad_id: Mapped[str] = mapped_column(String(36), index=True)
    name: Mapped[str] = mapped_column(String(500))
    # "created" — товар заведён; "updated" — что-то изменилось; "skipped" — пришёл без изменений
    action: Mapped[str] = mapped_column(String(20))
    # {"price": [было, стало], "images": [[...], [...]], ...} — только реально изменившиеся поля
    changed_fields: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Был ли у товара тег <Картинка> в import.xml этого захода (даже пустой)
    has_image_field: Mapped[bool] = mapped_column(Boolean, default=False)
    # Имена файлов картинок в том порядке, в каком их прислал МойСклад
    images_in_xml: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

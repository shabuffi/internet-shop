from decimal import Decimal
from pydantic import BaseModel, ConfigDict, model_validator
from app.core.timeutil import UtcDatetime


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    parent_id: str | None = None
    depth: int = 0  # уровень вложенности (0 — корень), вычисляется из кода в названии
    icon: str | None = None  # иконка категории (media_storage); свойство самой категории, None — без иконки


class TopCategoryOut(BaseModel):
    """Один слот блока «Топ категорий» на главной (уже резолвленный для витрины).

    Хранит только порядок (см. :mod:`app.services.top_categories`); ``name`` и ``icon`` берутся
    из самой категории по ``category_id`` — иконка не дублируется в конфиге блока.
    """
    category_id: str
    name: str            # актуальное имя категории из БД (следует за синхронизацией МойСклад)
    icon: str | None = None  # иконка КАТЕГОРИИ (Category.icon); None — плитка без картинки


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None
    image_url: str | None = None          # первая картинка (для карточки/списка/OG)
    images: list[str] | None = None       # все картинки (для галереи на карточке товара)
    attributes: list[dict] | None = None  # характеристики из МойСклад: [{name, value}]
    article: str | None = None
    price: Decimal
    stock: int
    available: bool = True
    is_active: bool
    # Слаги активных промо-категорий товара (по возрастанию display_order; первый — «основной»).
    promo_slugs: list[str] = []
    # «Старая цена» для показа зачёркнутой — уже с учётом наценки/скидки и только когда её нужно
    # показывать (см. _product_out); None — не показываем.
    old_price: Decimal | None = None
    # Deprecated: выводятся из membership на переходный период (пока фронт не перешёл на promo_slugs).
    is_new: bool = False        # = принадлежит категории со слагом «novinki»
    is_sale: bool = False       # = слаг «special»
    is_hot: bool = False        # = слаг «hot»
    category: CategoryOut | None = None
    updated_at: UtcDatetime

    @model_validator(mode="after")
    def _normalize_images(self):
        # Всегда отдаём список: если images пуст, но есть image_url — кладём его одним.
        self.images = self.images or ([self.image_url] if self.image_url else [])
        return self


class ProductListOut(BaseModel):
    items: list[ProductOut]
    total: int
    page: int
    page_size: int
    pages: int

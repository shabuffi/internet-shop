from decimal import Decimal
from datetime import datetime
from pydantic import BaseModel, ConfigDict, model_validator


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    parent_id: str | None = None
    depth: int = 0  # уровень вложенности (0 — корень), вычисляется из кода в названии


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
    is_new: bool = False        # флаг «Новинка» из МойСклад
    is_sale: bool = False       # флаг «Распродажа/Спецпредложение» из МойСклад
    category: CategoryOut | None = None
    updated_at: datetime

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

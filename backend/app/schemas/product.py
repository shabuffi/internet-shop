from decimal import Decimal
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    parent_id: str | None = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None
    article: str | None = None
    price: Decimal
    stock: int
    is_active: bool
    category: CategoryOut | None = None
    updated_at: datetime


class ProductListOut(BaseModel):
    items: list[ProductOut]
    total: int
    page: int
    page_size: int
    pages: int

from decimal import Decimal
from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator
import re


class OrderItemIn(BaseModel):
    product_id: str
    quantity: int = 1


class OrderIn(BaseModel):
    customer_name: str
    customer_phone: str
    customer_email: str | None = None
    delivery_address: str | None = None
    comment: str | None = None
    items: list[OrderItemIn]

    @field_validator("customer_phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10:
            raise ValueError("Телефон должен содержать минимум 10 цифр")
        return v

    @field_validator("items")
    @classmethod
    def validate_items(cls, v: list) -> list:
        if not v:
            raise ValueError("Корзина пуста")
        return v


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    product_name: str
    product_article: str | None = None
    price: Decimal
    quantity: int


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    number: str
    status: str
    total_amount: Decimal
    items: list[OrderItemOut]
    created_at: datetime

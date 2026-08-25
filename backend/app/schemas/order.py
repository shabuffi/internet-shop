from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.core.timeutil import UtcDatetime
import re

from app.schemas.auth import normalize_ru_phone, validate_email_format


class OrderItemIn(BaseModel):
    product_id: str
    quantity: int = Field(1, ge=1)  # минимум 1 — защита от отрицательного «списания» остатка


class OrderIn(BaseModel):
    customer_name: str
    customer_phone: str
    customer_email: str          # обязателен — на него уходит подтверждение и статусы заказа
    customer_type: str | None = None          # individual|ip|ooo (для гостя; из кабинета берём из профиля)
    customer_inn: str | None = None
    delivery_address: str | None = None
    # Способ получения обязателен: самовывоз / транспорт ТД / транспортная компания
    delivery_method: Literal["pickup", "shop_transport", "tk"]
    comment: str | None = None
    items: list[OrderItemIn]

    @field_validator("customer_phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        # Нормализация к +7XXXXXXXXXX (принимает 8/7/+7/без кода). Единый формат важен:
        # история гостевых заказов в админке группируется по точному совпадению телефона.
        return normalize_ru_phone(v)

    @field_validator("customer_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Укажите наименование заказчика")
        return v

    @field_validator("customer_email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        # E-mail обязателен: на него уходит подтверждение заказа и уведомления о смене статуса.
        v = (v or "").strip()
        if not v:
            raise ValueError("Укажите e-mail — на него придёт подтверждение заказа")
        return validate_email_format(v)

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
    # Статус из МойСклад (фактический статус исполнения), если пришёл обратно в обмене
    moysklad_status: str | None = None
    total_amount: Decimal
    items: list[OrderItemOut]
    created_at: UtcDatetime

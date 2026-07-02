"""Схемы регистрации/входа покупателя и выдачи профиля."""

import re
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Длина ИНН: ИП — 12 цифр, ООО (юрлицо) — 10 цифр
_INN_LEN = {"ip": 12, "ooo": 10}


class RegisterIn(BaseModel):
    email: str
    phone: str
    customer_type: Literal["individual", "ip", "ooo"]
    customer_name: str
    inn: str | None = None
    password: str
    consent: bool

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Некорректный email")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        v = v.strip()
        if len(re.sub(r"\D", "", v)) < 10:
            raise ValueError("Некорректный номер телефона")
        return v

    @field_validator("customer_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Укажите наименование заказчика")
        return v

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Пароль не короче 8 символов")
        return v

    @field_validator("consent")
    @classmethod
    def _consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Необходимо согласие на обработку персональных данных")
        return v

    @model_validator(mode="after")
    def _inn_required(self):
        """ИНН обязателен и фиксированной длины для ИП/ООО; для физлица — не храним."""
        need = _INN_LEN.get(self.customer_type)
        if need:
            inn = (self.inn or "").strip()
            if not inn.isdigit() or len(inn) != need:
                label = "ИП" if self.customer_type == "ip" else "ООО"
                raise ValueError(f"Для {label} укажите корректный ИНН ({need} цифр)")
            self.inn = inn
        else:
            self.inn = None
        return self


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.strip().lower()


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    phone: str
    customer_type: str
    customer_name: str
    inn: str | None = None
    discount_percent: Decimal
    created_at: datetime
    is_active: bool = True
    moysklad_ext_code: str | None = None

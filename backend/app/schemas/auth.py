"""Схемы регистрации/входа покупателя и выдачи профиля."""

import re
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Длина ИНН: ИП — 12 цифр, ООО (юрлицо) — 10 цифр
_INN_LEN = {"ip": 12, "ooo": 10}
# Почтовые домены Google: приём регистраций приостановлен (см. валидатор email)
_GOOGLE_MAIL_DOMAINS = {"gmail.com", "googlemail.com"}


def normalize_ru_phone(v: str) -> str:
    """Приводит российский номер к виду ``+7XXXXXXXXXX``.

    Принимает вариативность ввода: ``+7 999 000-00-00``, ``89990000000``,
    ``79990000000``, ``9990000000``. Иное — ``ValueError``.
    """
    digits = re.sub(r"\D", "", v)
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    if len(digits) != 10 or digits[0] != "9":
        raise ValueError("Укажите телефон в формате +7 9XX XXX-XX-XX или 8 9XX XXX-XX-XX")
    return f"+7{digits}"


def validate_password_strength(v: str) -> str:
    """Пароль: минимум 8 символов, строчные и ЗАГЛАВНЫЕ буквы, цифра."""
    if len(v) < 8:
        raise ValueError("Пароль не короче 8 символов")
    if not re.search(r"[a-zа-яё]", v):
        raise ValueError("Пароль должен содержать строчную букву")
    if not re.search(r"[A-ZА-ЯЁ]", v):
        raise ValueError("Пароль должен содержать заглавную букву")
    if not re.search(r"\d", v):
        raise ValueError("Пароль должен содержать цифру")
    return v


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
        if v.rsplit("@", 1)[-1] in _GOOGLE_MAIL_DOMAINS:
            raise ValueError(
                "Использование почты Google на российских сервисах приостанавливается "
                "с 1 сентября 2026 года — укажите, пожалуйста, другой email "
                "(например, Яндекс или Mail.ru)"
            )
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_ru_phone(v)

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
        return validate_password_strength(v)

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

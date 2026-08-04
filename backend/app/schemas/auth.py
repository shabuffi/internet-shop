"""Схемы регистрации/входа покупателя и выдачи профиля."""

import re
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Длина ИНН: ИП — 12 цифр, ООО (юрлицо) — 10 цифр
_INN_LEN = {"ip": 12, "ooo": 10}


def normalize_ru_phone(v: str) -> str:
    """Приводит российский номер к виду ``+7XXXXXXXXXX``.

    Принимает вариативность ввода: ``+7 999 000 00 00``, ``89990000000``,
    ``79990000000``, ``9990000000`` (разделители любые — вырезаем всё, кроме цифр).
    Иное — ``ValueError``. В тексте ошибки дефисы НЕ используем, чтобы не провоцировать
    их ввод: пример показываем пробелами.
    """
    digits = re.sub(r"\D", "", v)
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    if len(digits) != 10 or digits[0] != "9":
        raise ValueError("Неверно набран номер — введите 10 цифр, например +7 999 123 45 67")
    return f"+7{digits}"


def validate_email_format(v: str) -> str:
    """Проверяет формат e-mail и нормализует к нижнему регистру. Иначе — ``ValueError``."""
    v = v.strip().lower()
    if not _EMAIL_RE.match(v):
        raise ValueError("Неверный формат e-mail — например, mail@example.ru")
    return v


def validate_password_strength(v: str) -> str:
    """Пароль: только латиница, минимум 8 символов, строчная и ЗАГЛАВНАЯ буквы, цифра.

    Кириллицу отсекаем отдельной проверкой ДО требований к буквам — иначе на пароле
    «Пароль123» сообщение было бы про отсутствие латинской буквы, а не про раскладку.
    """
    if len(v) < 8:
        raise ValueError("Пароль не короче 8 символов")
    if re.search(r"[а-яё]", v, re.IGNORECASE):
        raise ValueError("Пароль только латиницей — переключите раскладку")
    if not re.search(r"[a-z]", v):
        raise ValueError("Пароль должен содержать строчную латинскую букву")
    if not re.search(r"[A-Z]", v):
        raise ValueError("Пароль должен содержать заглавную латинскую букву")
    if not re.search(r"\d", v):
        raise ValueError("Пароль должен содержать цифру")
    return v


class RegisterIn(BaseModel):
    email: str
    phone: str
    customer_type: Literal["individual", "ip", "ooo"]
    customer_name: str
    # validate_default: валидатор должен отработать и когда ИНН вовсе не прислали
    # (для ИП/ООО он обязателен) — иначе на дефолте None проверка не запустится.
    inn: str | None = Field(None, validate_default=True)
    password: str
    consent: bool

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        # Gmail и другие иностранные почты РАЗРЕШЕНЫ как логин — закон запрещает только
        # авторизацию через иностранные сервисы («Войти через Google»), а не e-mail-адрес.
        return validate_email_format(v)

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

    @field_validator("inn")
    @classmethod
    def _inn(cls, v: str | None, info: ValidationInfo) -> str | None:
        """ИНН обязателен и фиксированной длины для ИП/ООО; для физлица — не храним.

        Проверяем как ПОЛЕ (а не модель): ошибка приходит с ``loc=["body","inn"]``,
        поэтому форма подсвечивает именно поле ИНН. `customer_type` объявлен выше,
        значит уже разобран и доступен в ``info.data``.
        """
        ctype = info.data.get("customer_type")
        need = _INN_LEN.get(ctype or "")
        if not need:
            return None                       # физлицо — ИНН не храним
        inn = (v or "").strip()
        if not inn.isdigit() or len(inn) != need:
            label = "ИП" if ctype == "ip" else "ООО"
            raise ValueError(f"Для {label} укажите корректный ИНН ({need} цифр)")
        return inn


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.strip().lower()


class ChangePasswordIn(BaseModel):
    """Смена пароля в личном кабинете: текущий (для проверки) + новый (с проверкой надёжности)."""
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _new(cls, v: str) -> str:
        return validate_password_strength(v)


class ChangeEmailIn(BaseModel):
    """Заявка на смену email в ЛК.

    Текущий пароль обязателен: email — это логин, поэтому его подмена равносильна захвату
    аккаунта (украденной куки было бы достаточно, чтобы потом «восстановить» пароль на свой
    адрес). Проверка пароля — та же, что при смене пароля (``ChangePasswordIn``).
    """
    new_email: str
    current_password: str

    @field_validator("new_email")
    @classmethod
    def _email(cls, v: str) -> str:
        return validate_email_format(v)


class ConfirmEmailChangeIn(BaseModel):
    """Подтверждение смены email по токену из письма (ссылка ушла на НОВЫЙ адрес)."""
    token: str


class EmailCheckIn(BaseModel):
    """Проверка адреса на опечатку в домене. Формат намеренно НЕ валидируем: адрес могут
    прислать недописанным (проверка идёт при выходе из поля), а ответ носит характер подсказки."""
    email: str


class EmailSuggestionOut(BaseModel):
    """Подсказка об опечатке: полный исправленный адрес или ``None``, если всё в порядке."""
    suggestion: str | None = None


class ForgotPasswordIn(BaseModel):
    """Запрос восстановления пароля — только email. Ответ всегда одинаковый (не раскрываем аккаунт)."""
    email: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.strip().lower()


class ResetPasswordIn(BaseModel):
    """Установка нового пароля по токену из письма."""
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _new(cls, v: str) -> str:
        return validate_password_strength(v)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    # Заявленный, но ещё не подтверждённый адрес — ЛК показывает «ждём подтверждения».
    pending_email: str | None = None
    phone: str
    customer_type: str
    customer_name: str
    inn: str | None = None
    discount_percent: Decimal
    created_at: datetime
    is_active: bool = True
    moysklad_ext_code: str | None = None

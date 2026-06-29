"""Покупатель (клиент магазина) — самостоятельная регистрация и личный кабинет.

Отдельно от ``AdminUser`` (это сотрудники). У клиента есть персональная скидка
(``discount_percent``) от базовой цены МойСклад: диапазон −30…+9, по умолчанию +5.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import String, Numeric, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    phone: Mapped[str] = mapped_column(String, nullable=False)
    # Тип заказчика: individual (физлицо) | ip (ИП) | ooo (ООО)
    customer_type: Mapped[str] = mapped_column(String, nullable=False)
    # Наименование заказчика: ФИО для физлица, название организации для ИП/ООО
    customer_name: Mapped[str] = mapped_column(String, nullable=False)
    # ИНН — обязателен для ИП (12 цифр) и ООО (10 цифр); для физлица не используется
    inn: Mapped[str | None] = mapped_column(String, nullable=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    # Персональная корректировка цены в %: −30…+9, дефолт +5 (меняется в админке)
    discount_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("5"), server_default="5"
    )
    # Момент согласия на обработку персональных данных (152-ФЗ)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

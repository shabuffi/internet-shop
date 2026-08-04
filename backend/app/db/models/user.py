"""Покупатель (клиент магазина) — самостоятельная регистрация и личный кабинет.

Отдельно от ``AdminUser`` (это сотрудники). У клиента есть персональная скидка
(``discount_percent``) от базовой цены МойСклад: диапазон −30…+9, по умолчанию 0
(зарегистрированный платит базовую цену X; гость — X+наценка). Владелец может дать
клиенту персональную скидку.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import String, Numeric, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    # Заявка на смену email: новый адрес живёт здесь, пока не подтверждён письмом, и только
    # потом заменяет ``email`` (он же логин) — см. auth.request_email_change/confirm_email_change.
    # Уникальность на pending НЕ ставим сознательно: два клиента вправе заявить один и тот же
    # адрес, победит первый подтвердивший (второй получит понятный 409), а unique-индекс
    # отказал бы второму ещё на заявке.
    pending_email: Mapped[str | None] = mapped_column(String, nullable=True)
    pending_email_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Один номер = один аккаунт: уникальность на уровне БД (не только проверкой в коде,
    # которая подвержена гонке при одновременной регистрации).
    phone: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    # Тип заказчика: individual (физлицо) | ip (ИП) | ooo (ООО)
    customer_type: Mapped[str] = mapped_column(String, nullable=False)
    # Наименование заказчика: ФИО для физлица, название организации для ИП/ООО
    customer_name: Mapped[str] = mapped_column(String, nullable=False)
    # ИНН — обязателен для ИП (12 цифр) и ООО (10 цифр); для физлица не используется
    inn: Mapped[str | None] = mapped_column(String, nullable=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    # Персональная корректировка цены в %: −30…+9, дефолт 0 (регистрация = базовая цена X).
    # Отрицательное — скидка, положительное — наценка; меняется владельцем в админке.
    discount_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0"), server_default="0"
    )
    # Момент согласия на обработку персональных данных (152-ФЗ)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    # Активирован ли аккаунт сотрудником ТД. Новые регистрации — False (ждут активации);
    # server_default true — чтобы уже существующие покупатели не потеряли доступ при миграции.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="true")
    # «Внешний код» контрагента для МойСклад: генерируется при регистрации (новый контрагент)
    # либо сотрудник вписывает код существующего контрагента (привязка старого клиента).
    # В заказе уходит как <Ид> контрагента → попадает во «Внешний код» в МойСклад.
    moysklad_ext_code: Mapped[str | None] = mapped_column(String, nullable=True)

"""Ценообразование витрины.

Цена в БД (``Product.price``) — базовая, как пришла из МойСклад. Покупателю мы
показываем скорректированную цену: для незарегистрированных — с наценкой
``DEFAULT_MARKUP_PERCENT`` (по умолчанию +10%), для вошедших — с их персональной
скидкой (``User.discount_percent``, диапазон −30…+9). Считаем ВСЕГДА на бэкенде,
чтобы цену нельзя было подделать с клиента, и округляем до копеек.
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:                      # только для аннотаций — модель тут не нужна в рантайме
    from app.db.models.user import User

_CENTS = Decimal("0.01")


def percent_for(user: "User | None") -> Decimal | None:
    """Процент корректировки цены для покупателя: скидка вошедшего либо наценка гостя.

    Неактивированный аккаунт считается ГОСТЕМ: пока сотрудник ТД не проверил клиента,
    клиентскую цену он не видит. Иначе сама по себе регистрация давала бы −10% к цене
    без всякой проверки — ровно это и произошло с заказом ORD-0034 03.08.2026.

    Args:
        user: Вошедший покупатель или ``None`` (гость).

    Returns:
        ``User.discount_percent`` для активированного покупателя, иначе ``None``
        (в :func:`adjusted_price` это означает гостевую наценку).
    """
    if user is None or not user.is_active:
        return None
    return user.discount_percent


def adjusted_price(base: Decimal | None, percent: Decimal | float | int | None = None) -> Decimal | None:
    """Возвращает цену с учётом наценки/скидки, округлённую до копеек.

    Args:
        base: Базовая цена из МойСклад (``Product.price``). ``None`` → ``None``.
        percent: Процент корректировки (например ``10`` = +10%, ``-30`` = −30%).
            Если ``None`` — берётся ``DEFAULT_MARKUP_PERCENT`` (наценка для гостей).

    Returns:
        Цена ``base × (1 + percent/100)``, округлённая до 0.01 (банковское — half up).
    """
    if base is None:
        return None
    if percent is None:
        percent = settings.DEFAULT_MARKUP_PERCENT
    factor = (Decimal(100) + Decimal(str(percent))) / Decimal(100)
    return (Decimal(base) * factor).quantize(_CENTS, rounding=ROUND_HALF_UP)

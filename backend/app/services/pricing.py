"""Ценообразование витрины.

Цена в БД (``Product.price``) — базовая, как пришла из МойСклад. Покупателю мы
показываем скорректированную цену: для незарегистрированных — с наценкой
``DEFAULT_MARKUP_PERCENT`` (по умолчанию +10%), для вошедших — с их персональной
скидкой (``User.discount_percent``, диапазон −30…+9). Считаем ВСЕГДА на бэкенде,
чтобы цену нельзя было подделать с клиента, и округляем до копеек.
"""

from decimal import Decimal, ROUND_HALF_UP

from app.core.config import settings

_CENTS = Decimal("0.01")


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

"""Единая работа со временем на границе API.

В БД таймстампы хранятся **наивным UTC** (Postgres ``func.now()`` в UTC-сессии
контейнера; так же трактует наивные даты весь остальной код — см. ``_now_naive``).
Хранение остаётся UTC и НЕ меняется. Проблема только на выдаче наружу: наивный
datetime сериализуется в ISO **без** зоны (``2026-08-25T12:00:00``), и любой
потребитель, который парсит такую строку через ``new Date(...)``, трактует её как
локальное время — отсюда сдвиг. Поэтому на границе API проставляем явное смещение
UTC (``+00:00``), а конвертацию в пояс показа делает клиент (см. ``formatMsk`` во
фронте, ``Europe/Moscow``). Это не фиксированный «+3», а честная передача зоны.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from pydantic import PlainSerializer


def ensure_utc(dt: datetime) -> datetime:
    """Возвращает timezone-aware datetime в UTC.

    Наивный ``dt`` трактуется как UTC (наша конвенция хранения), aware — приводится к
    UTC через ``astimezone``. Не сдвигает момент времени, только делает зону явной.
    """
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def iso_utc(dt: datetime | None) -> str | None:
    """ISO-8601 c явным смещением UTC (``…+00:00``) — или ``None``.

    Для ручной сборки JSON в эндпоинтах (``admin.py``), где ответ формируется словарём,
    а не Pydantic-схемой.
    """
    return ensure_utc(dt).isoformat() if dt is not None else None


# Тип поля Pydantic-схем: наивный-UTC (или aware) datetime сериализуется в JSON как
# UTC c явным смещением. Валидация/парсинг не меняются — только выдача.
UtcDatetime = Annotated[
    datetime,
    PlainSerializer(lambda dt: ensure_utc(dt).isoformat(), return_type=str, when_used="json"),
]

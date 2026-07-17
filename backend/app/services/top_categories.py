"""Блок «Топ категорий» на главной — управляемый из админки.

Ровно :data:`SLOTS` слотов. Слот хранит ТОЛЬКО ``category_id`` (порядок = порядок слотов) — имя
и иконка берутся из самой категории (:class:`Category`), поэтому иконка не дублируется здесь.
Управление иконками — отдельная вкладка «Категории» (``Category.icon``).

Хранилище — один ключ :data:`SETTING_KEY` в :class:`ShopSettings` (JSON-список id), как ``brands``
и ``home_banners``: новых таблиц и миграций не требует. В коде плиток нет — источник истины здесь.
"""
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.admin import ShopSettings
from app.db.models.product import Category

# Ключ настройки и число слотов. SLOTS фиксировано: главная рассчитана ровно на этот блок плиток.
SETTING_KEY = "top_categories"
SLOTS = 8


def _slot_id(item: object) -> str:
    """Достаёт category_id из элемента конфига.

    Терпит два формата: новый (голая строка id) и legacy (``{"category_id": ..., "icon": ...}``
    от прежней версии, где иконка лежала в слоте) — из legacy берём только id, иконку отбрасываем.
    """
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        cid = item.get("category_id")
        return cid if isinstance(cid, str) else ""
    return ""


def load_raw(db: Session) -> list[str]:
    """category_id по слотам как сохранены (без добивки), максимум :data:`SLOTS`."""
    row = db.get(ShopSettings, SETTING_KEY)
    if not row or not row.value:
        return []
    try:
        data = json.loads(row.value)
    except (ValueError, TypeError):
        return []
    if not isinstance(data, list):
        return []
    return [_slot_id(item) for item in data[:SLOTS]]


def load_padded(db: Session) -> list[str]:
    """Ровно :data:`SLOTS` category_id (недостающие — пустая строка) — для формы админки."""
    ids = load_raw(db)
    ids += [""] * (SLOTS - len(ids))
    return ids[:SLOTS]


def save(db: Session, slots: list) -> None:
    """Перезаписывает порядок (без commit). Хранит ТОЛЬКО category_id — никаких иконок/имён."""
    ids = [_slot_id(item) for item in (slots or [])[:SLOTS]]
    value = json.dumps(ids, ensure_ascii=False)
    row = db.get(ShopSettings, SETTING_KEY)
    if row:
        row.value = value
    else:
        db.add(ShopSettings(key=SETTING_KEY, value=value))


def resolve_public(db: Session) -> list[dict]:
    """Для витрины: заполненные слоты с существующей категорией, в порядке слотов.

    Имя и иконка берутся из самой категории (``Category.name``/``Category.icon``) по ``category_id`` —
    так изменение иконки категории сразу отражается в блоке без пере-настройки. Слот без категории
    или с категорией, которой уже нет в каталоге, пропускаем — блок не падает и не ведёт в пустоту.
    """
    ids = load_raw(db)
    wanted = [cid for cid in ids if cid]
    cats: dict[str, Category] = {}
    if wanted:
        for c in db.scalars(select(Category).where(Category.id.in_(wanted))):
            cats[c.id] = c
    out: list[dict] = []
    for cid in ids:
        c = cats.get(cid)
        if c is None:
            continue
        out.append({"category_id": c.id, "name": c.name, "icon": c.icon})
    return out

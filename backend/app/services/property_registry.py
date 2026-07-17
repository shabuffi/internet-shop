"""Реестр доп-полей МойСклад: наполнение из обмена и данные для выпадающего списка в админке.

Реестр — единственное место, где живёт ИМЯ доп-поля. Промо-категория ссылается на строку
реестра (``PromoCategory.source_field_id``) и имя не кэширует, поэтому переименование поля в
МойСклад подхватывается само.

Отдельно от ``promo_service``, потому что тот — чистая логика без БД, а здесь нужна сессия.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func, text
from sqlalchemy.orm import Session

from app.db.models.promo import MoySkladProperty
from app.services import promo_service


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def upsert_from_exchange(db: Session, prop_map: dict[str, str]) -> None:
    """Обновляет реестр по свойствам классификатора этого обмена (``{Ид: имя}``).

    Три ветки — покрывают и переименование, и «защёлку» бэкфилл-строк:

    1. Есть строка с этим ``ms_property_id`` → обновляем ``name`` (поле переименовали в
       МойСклад — подпись в админке следует за ним, привязки категорий не рвутся).
    2. Иначе есть НЕпривязанная строка с таким же именем (бэкфилл из миграции или реквизит)
       → проставляем ``ms_property_id``. ``source_field_id`` категорий при этом не меняется —
       строка та же, поэтому перепривязка не нужна.
    3. Иначе → новая строка.

    Категорий НЕ создаёт: новое поле попадает только в реестр и ждёт, пока владелец сам решит
    заводить ли по нему промо-категорию.
    """
    if not prop_map:
        return

    now = _utcnow()
    rows = db.query(MoySkladProperty).all()
    by_ms_id = {r.ms_property_id: r for r in rows if r.ms_property_id}
    # Кандидаты на защёлку — только строки без Ид. Среди них может быть несколько с одним
    # именем; в таком случае защёлку не ставим (см. ниже).
    unbound_by_name: dict[str, list[MoySkladProperty]] = {}
    for r in rows:
        if not r.ms_property_id:
            unbound_by_name.setdefault(r.name.strip(), []).append(r)

    for ms_id, raw_name in prop_map.items():
        name = (raw_name or "").strip()
        if not ms_id or not name:
            continue

        row = by_ms_id.get(ms_id)
        if row is not None:                      # (1) известное поле — возможно, переименовано
            if row.name != name:
                row.name = name
            row.origin = "classifier"
            row.last_seen_at = now
            continue

        candidates = unbound_by_name.get(name) or []
        if len(candidates) == 1:                 # (2) защёлка: у строки появился настоящий Ид
            row = candidates[0]
            row.ms_property_id = ms_id
            row.origin = "classifier"
            row.last_seen_at = now
            by_ms_id[ms_id] = row
            unbound_by_name.pop(name, None)
            continue
        # Неоднозначность (два поля с одинаковым именем) — защёлку не ставим, заводим отдельную
        # строку. Владелец выберет нужное поле в админке.

        row = MoySkladProperty(                  # (3) поле впервые
            id=str(uuid.uuid4()), ms_property_id=ms_id, name=name,
            origin="classifier", last_seen_at=now,
        )
        db.add(row)
        by_ms_id[ms_id] = row


def product_counts(db: Session) -> dict[str, int]:
    """{имя доп-поля: сколько активных товаров попадут в раздел по этому полю} — одним запросом.

    Считаем ровно то же, что считает членством импорт (``promo_service.is_flag_on``): значение
    непустое и не «выключено» (0/нет/false/…). Раньше здесь была «заполненность» — число в
    выпадающем списке не совпадало с бейджем на карточке раздела и обещало владельцу больше
    товаров, чем раздел получит.

    Неактивные (архивные) товары не считаем: на витрине их нет ни при каком остатке, и в числе
    раздела им делать нечего. ⚠️ Остаток здесь НЕ фильтруем сознательно: товар с нулевым
    остатком скрыт временно и вернётся на витрину сам, а из числа раздела он бы исчез совсем.
    Поэтому число может быть больше, чем показывает страница раздела (у «Распродажи» на проде
    так и есть: галочка у 37, а в наличии ни одного).

    Не денормализуем: на копии прода (12 590 товаров) запрос занимает ~12 мс, а колонка-счётчик
    стоила бы бэкфилла и риска разойтись с данными.

    ⚠️ Имена доп-полей в JSON хранятся юникод-эскейпами → только ``jsonb_array_elements``;
    ``attributes::text ILIKE '%кириллица%'`` даёт ложный ноль.
    """
    rows = db.execute(
        text(
            """
            SELECT e->>'name' AS name, count(*) AS cnt
            FROM products, LATERAL jsonb_array_elements(attributes::jsonb) e
            WHERE attributes IS NOT NULL
              AND jsonb_typeof(attributes::jsonb) = 'array'
              AND products.is_active
              AND lower(btrim(coalesce(e->>'value', ''))) <> ALL(:off)
            GROUP BY e->>'name'
            """
        ),
        # Список «выключенных» значений берём из promo_service, чтобы SQL и импорт не разъехались.
        {"off": list(promo_service.FLAG_FALSE_VALUES)},
    ).all()
    return {name: cnt for name, cnt in rows if name}


def flag_like_names(db: Session) -> set[str]:
    """Имена полей, у которых ВСЕ непустые значения похожи на галочку (0/1, да/нет).

    Подсказка для сортировки выпадающего списка — не фильтр (см.
    :func:`promo_service.is_flag_like_value`).
    """
    rows = db.execute(text(
        """
        SELECT e->>'name' AS name, e->>'value' AS value
        FROM products, LATERAL jsonb_array_elements(attributes::jsonb) e
        WHERE attributes IS NOT NULL
          AND jsonb_typeof(attributes::jsonb) = 'array'
          AND coalesce(e->>'value', '') <> ''
        GROUP BY e->>'name', e->>'value'
        """
    )).all()
    values: dict[str, list[str]] = {}
    for name, value in rows:
        if name:
            values.setdefault(name, []).append(value)
    return {
        name for name, vals in values.items()
        if vals and all(promo_service.is_flag_like_value(v) for v in vals)
    }

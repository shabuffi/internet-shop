import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db.models.product import Product, Category, SyncLog
from app.integrations.moysklad.commerceml_parser import ParsedCatalog


def _utcnow() -> datetime:
    """Наивный UTC-таймстамп (замена устаревшего datetime.utcnow())."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def upsert_catalog(db: Session, catalog: ParsedCatalog, source: str = "commerceml") -> SyncLog:
    """Сохраняет распарсенный каталог в БД (upsert по ``moysklad_id``).

    Сначала создаёт/обновляет категории и проставляет их связи родитель-потомок, затем
    товары: новые вставляются, существующие обновляются. Вся операция — одна транзакция:
    при ошибке делается откат, а в журнал пишется статус ``error``.

    Args:
        db: Сессия БД.
        catalog: Распарсенный каталог (категории и товары) из CommerceML.
        source: Источник синхронизации для журнала (``commerceml`` / ``rest_api``).

    Returns:
        Запись :class:`SyncLog` с итогами: статус и счётчики созданных/обновлённых товаров.

    Raises:
        Exception: Любая ошибка записи пробрасывается наверх (после отката и записи
            статуса ``error`` в журнал).
    """
    log = SyncLog(source=source, status="running", started_at=_utcnow())
    db.add(log)
    db.flush()

    created = updated = 0

    try:
        # ─── Категории ────────────────────────────────────────────────────────
        category_id_map: dict[str, str] = {}       # moysklad_id → наш internal id
        category_objs: dict[str, Category] = {}    # moysklad_id → объект Category

        for parsed_cat in catalog.categories:
            cat = db.query(Category).filter_by(moysklad_id=parsed_cat.moysklad_id).first()
            if cat is None:
                cat = Category(
                    id=str(uuid.uuid4()),
                    moysklad_id=parsed_cat.moysklad_id,
                    name=parsed_cat.name,
                )
                db.add(cat)
            else:
                cat.name = parsed_cat.name

            # Родительскую категорию установим после того как все уже добавлены
            category_objs[parsed_cat.moysklad_id] = cat
            category_id_map[parsed_cat.moysklad_id] = cat.id

        # Проставляем parent_id по объектам в памяти — без повторного запроса в БД.
        # (При autoflush=False свежедобавленные категории ещё не во flush'ены, и
        # повторный db.query() их не нашёл бы — parent_id не проставлялся бы.)
        for parsed_cat in catalog.categories:
            if parsed_cat.parent_id and parsed_cat.parent_id in category_id_map:
                category_objs[parsed_cat.moysklad_id].parent_id = category_id_map[parsed_cat.parent_id]

        db.flush()

        # ─── Товары ───────────────────────────────────────────────────────────
        for parsed_product in catalog.products:
            product = db.query(Product).filter_by(moysklad_id=parsed_product.moysklad_id).first()

            # Определяем internal category_id
            cat_id = None
            if parsed_product.category_id and parsed_product.category_id in category_id_map:
                cat_id = category_id_map[parsed_product.category_id]

            if product is None:
                product = Product(
                    id=str(uuid.uuid4()),
                    moysklad_id=parsed_product.moysklad_id,
                    name=parsed_product.name,
                    description=parsed_product.description,
                    article=parsed_product.article,
                    code=parsed_product.code,
                    image_url=parsed_product.image_url,
                    price=parsed_product.price,
                    stock=parsed_product.stock,
                    category_id=cat_id,
                    synced_at=_utcnow(),
                )
                db.add(product)
                created += 1
            else:
                product.name = parsed_product.name
                product.article = parsed_product.article
                product.code = parsed_product.code
                product.price = parsed_product.price
                product.stock = parsed_product.stock
                product.category_id = cat_id
                product.synced_at = _utcnow()
                # Описание и картинку НЕ затираем пустыми из CommerceML — МойСклад их в
                # обмене не присылает, они подгружаются из REST (fetch_product_images).
                # Перезаписываем только если обмен реально что-то прислал.
                if parsed_product.description:
                    product.description = parsed_product.description
                if parsed_product.image_url:
                    product.image_url = parsed_product.image_url
                updated += 1

        db.commit()

        log.status = "success"
        log.products_created = created
        log.products_updated = updated
        log.finished_at = _utcnow()
        db.commit()

    except Exception as exc:
        db.rollback()
        log.status = "error"
        log.error_message = str(exc)
        log.finished_at = _utcnow()
        db.commit()
        raise

    return log

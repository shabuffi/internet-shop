import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db.models.product import Product, Category, SyncLog
from app.integrations.moysklad.commerceml_parser import ParsedCatalog
from app.services.media_storage import image_name


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

        # Все существующие категории — одним запросом (а не по одной на каждую: важно для
        # больших каталогs МойСклад с сотнями категорий).
        existing_cats = {c.moysklad_id: c for c in db.query(Category).all()}
        for parsed_cat in catalog.categories:
            cat = existing_cats.get(parsed_cat.moysklad_id)
            if cat is None:
                cat = Category(
                    id=str(uuid.uuid4()),
                    moysklad_id=parsed_cat.moysklad_id,
                    name=parsed_cat.name,
                )
                db.add(cat)
                existing_cats[parsed_cat.moysklad_id] = cat
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
        # Все существующие товары — одним запросом (на 10000 товаров 10000 отдельных
        # SELECT'ов повесили бы обмен и дали таймаут у МойСклад).
        existing_products = {p.moysklad_id: p for p in db.query(Product).all()}

        # Несёт ли ЭТОТ раунд обмена картинки вообще? У этого аккаунта обычный import.xml
        # идёт БЕЗ <Картинка> (картинки приходят только в отдельных «фото-раундах»). Поэтому
        # трогаем картинки ТОЛЬКО когда они реально пришли хоть у одного товара — иначе
        # обычный обмен обнулил бы ВСЕ фото (инцидент 29.06.2026). Внутри фото-раунда пустой
        # список у товара = картинку удалили в МойСклад → чистим (так удаление всё же работает).
        round_has_images = any(p.images for p in catalog.products)

        for parsed_product in catalog.products:
            product = existing_products.get(parsed_product.moysklad_id)

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
                    image_url=image_name(parsed_product.image_url),
                    images=[image_name(x) for x in parsed_product.images],
                    attributes=parsed_product.attributes or None,
                    price=parsed_product.price,
                    stock=parsed_product.stock,
                    category_id=cat_id,
                    synced_at=_utcnow(),
                )
                db.add(product)
                existing_products[parsed_product.moysklad_id] = product
                created += 1
            else:
                product.name = parsed_product.name
                # Артикул/код обновляем только если пришли — иначе «дозаливка картинок»
                # вторым import.xml (без артикула) затёрла бы их в None.
                if parsed_product.article:
                    product.article = parsed_product.article
                if parsed_product.code:
                    product.code = parsed_product.code
                product.category_id = cat_id
                product.synced_at = _utcnow()
                # Цену/остаток перезаписываем ТОЛЬКО если они пришли в offers.xml этого
                # захода. Иначе import.xml без offers (например, второй заход с картинкой)
                # обнулил бы их. (parsed.has_offer ставится в parse_offers_xml.)
                if parsed_product.has_offer:
                    product.price = parsed_product.price
                    product.stock = parsed_product.stock
                # Описание приходит в import.xml (<Описание>), картинка — отдельным файлом
                # обмена (<Картинка> = имя файла). Перезаписываем только если обмен реально
                # что-то прислал — чтобы пустое значение не затёрло уже сохранённое.
                if parsed_product.description:
                    product.description = parsed_product.description
                # Характеристики обновляем только если пришли (как и описание/артикул)
                if parsed_product.attributes:
                    product.attributes = parsed_product.attributes
                # Картинки трогаем ТОЛЬКО в фото-раунде (round_has_images) и если их не ведут
                # вручную. Обычный import.xml у этого аккаунта идёт без <Картинка> — вне фото-
                # раунда не трогаем, иначе обнулим все фото (инцидент 29.06.2026). Внутри фото-
                # раунда пустой список = фото удалили в МойСклад → чистим (удаление работает).
                if round_has_images and not product.images_manual:
                    imgs = [image_name(x) for x in parsed_product.images]
                    product.images = imgs
                    product.image_url = imgs[0] if imgs else None
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

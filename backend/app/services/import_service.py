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
                # Считаем «Обновлено» по РЕАЛЬНЫМ изменениям (иначе журнал показывал бы весь
                # каталог 12555 на каждом обмене, хотя ничего не поменялось). Поле трогаем и
                # флаг ставим только когда значение отличается.
                changed = False
                if product.name != parsed_product.name:
                    product.name = parsed_product.name; changed = True
                # Артикул/код обновляем только если пришли — иначе «дозаливка картинок»
                # вторым import.xml (без артикула) затёрла бы их в None.
                if parsed_product.article and product.article != parsed_product.article:
                    product.article = parsed_product.article; changed = True
                if parsed_product.code and product.code != parsed_product.code:
                    product.code = parsed_product.code; changed = True
                if product.category_id != cat_id:
                    product.category_id = cat_id; changed = True
                # Цену/остаток перезаписываем ТОЛЬКО если они пришли в offers.xml этого
                # захода. Иначе import.xml без offers (например, второй заход с картинкой)
                # обнулил бы их. (parsed.has_offer ставится в parse_offers_xml.)
                if parsed_product.has_offer:
                    if product.price != parsed_product.price:
                        product.price = parsed_product.price; changed = True
                    if product.stock != parsed_product.stock:
                        product.stock = parsed_product.stock; changed = True
                # Описание приходит в import.xml (<Описание>), картинка — отдельным файлом
                # обмена (<Картинка> = имя файла). Перезаписываем только если обмен реально
                # что-то прислал — чтобы пустое значение не затёрло уже сохранённое.
                if parsed_product.description and product.description != parsed_product.description:
                    product.description = parsed_product.description; changed = True
                # Характеристики обновляем только если пришли (как и описание/артикул)
                if parsed_product.attributes and product.attributes != parsed_product.attributes:
                    product.attributes = parsed_product.attributes; changed = True
                # Картинки трогаем ПОФАЙЛОВО — только если У ЭТОГО товара в import.xml реально
                # был тег <Картинка> (или пришли имена файлов). Раньше решали «по всему раунду»
                # (round_has_images): если в заходе была хоть одна картинка, у ВСЕХ товаров без
                # <Картинка> фото затиралось в ноль → 350 осиротевших файлов (инцидент 29.06.2026).
                # Теперь: тег заполнен → ставим; тег пустой (has_image_field, images=[]) → удаление,
                # чистим; тега не было → НЕ трогаем (обычный import.xml чужие фото не сбрасывает).
                if (parsed_product.has_image_field or parsed_product.images) and not product.images_manual:
                    imgs = [image_name(x) for x in parsed_product.images]
                    if product.images != imgs:
                        product.images = imgs
                        product.image_url = imgs[0] if imgs else None
                        changed = True
                # Отметку последнего обмена ставим всегда (товар «виден» в выгрузке),
                # а в счётчик «Обновлено» попадают только реально изменившиеся.
                product.synced_at = _utcnow()
                if changed:
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

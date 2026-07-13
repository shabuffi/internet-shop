import os
import glob
import json
import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.models.product import Product, Category, SyncLog
from app.integrations.moysklad.commerceml_parser import ParsedCatalog
from app.services.media_storage import image_name


# Предохранитель: сколько товаров МАКСИМУМ можно «обнулить по фото» за один обмен.
# Реальные удаления фото в МойСклад идут поштучно; массовое стирание (десятки/сотни) —
# это признак сбоя выгрузки (как инцидент 29.06.2026), а не настоящих удалений. Такое
# массовое стирание НЕ применяется, фото сохраняются, в журнал пишется предупреждение.
MAX_IMAGE_CLEARS = 30

# Сколько последних слепков привязок фото храним (для восстановления без МойСклад).
IMAGE_MANIFEST_KEEP = 30

# Флаги-галочки из МойСклад (доп-поля). Распознаём по имени поля (частичное совпадение),
# значение-галочка считается «включённой», если не входит в _FLAG_FALSE.
_NEW_PATTERNS = ("новин",)
_SALE_PATTERNS = ("распродаж", "спецпредлож", "акци", "скидк")
_HOT_PATTERNS = ("убойн",)          # «Убойные цены»
_FLAG_FALSE = {"", "false", "нет", "0", "no", "off", "ложь", "none", "-"}


def _attr_flag(attributes, patterns) -> bool:
    """True, если среди доп-полей есть поле с именем из ``patterns`` и «включённым» значением."""
    for a in attributes or []:
        name = (a.get("name") or "").strip().lower()
        if any(p in name for p in patterns):
            val = str(a.get("value") or "").strip().lower()
            if val not in _FLAG_FALSE:
                return True
    return False


def _prop_defined(property_names, patterns) -> bool:
    """True, если в схеме доп-полей обмена (``property_names``) есть поле из ``patterns``.

    Отличает «полный каталог со схемой свойств» (флаг можно пересчитывать, в т.ч. СБРОСИТЬ
    снятый в МойСклад) от «дозаливки» без свойств (флаги не трогаем). Раньше пересчёт был
    завязан на наличие любых атрибутов у самого товара и залипал (флаг оставался True),
    если снятое доп-поле было у товара единственным — атрибуты пустели, пересчёт пропускался.
    """
    for name in property_names or ():
        low = (name or "").strip().lower()
        if any(p in low for p in patterns):
            return True
    return False


def _utcnow() -> datetime:
    """Наивный UTC-таймстамп (замена устаревшего datetime.utcnow())."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _manifest_dir() -> str:
    return os.path.join(settings.MEDIA_DIR, "manifests")


def write_image_manifest(db: Session) -> tuple[str, int]:
    """Сохраняет слепок привязок фото (moysklad_id → images) в JSON на том медиа-хранилища.

    Файлы картинок и так лежат на диске (том ``media_data``); слепок хранит, КАКОЙ файл
    к какому товару привязан. Если фото когда-нибудь отвяжется (сбой/затирание), привязку
    можно восстановить из слепка (:func:`restore_images_from_manifest`) — без повторной
    выгрузки из МойСклад (которая рискует наплодить дубли). Держим последние N слепков.

    Returns:
        Пара ``(путь_к_файлу, число_товаров_с_фото)``.
    """
    mdir = _manifest_dir()
    os.makedirs(mdir, exist_ok=True)
    data = [
        {"moysklad_id": p.moysklad_id, "image_url": p.image_url, "images": p.images}
        for p in db.query(Product).all()
        if p.images
    ]
    path = os.path.join(mdir, f"images_{_utcnow():%Y%m%d_%H%M%S}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    # ротация — оставляем только последние IMAGE_MANIFEST_KEEP
    for old in sorted(glob.glob(os.path.join(mdir, "images_*.json")))[:-IMAGE_MANIFEST_KEEP]:
        try:
            os.remove(old)
        except OSError:
            pass
    return path, len(data)


def restore_images_from_manifest(db: Session, path: str | None = None) -> int:
    """Восстанавливает привязки фото из слепка (последнего, если ``path`` не задан).

    Возвращает фото товарам, у которых сейчас картинок нет, а в слепке были И файл ещё
    лежит на диске. Ручные картинки (``images_manual``) и товары, у которых фото уже есть,
    не трогает. Идемпотентно и безопасно — только добавляет утраченные привязки.

    Returns:
        Число товаров, которым вернули фото.
    """
    if path is None:
        found = sorted(glob.glob(os.path.join(_manifest_dir(), "images_*.json")))
        if not found:
            return 0
        path = found[-1]
    with open(path, encoding="utf-8") as f:
        manifest = json.load(f)

    on_disk = set(os.listdir(settings.MEDIA_DIR)) if os.path.isdir(settings.MEDIA_DIR) else set()
    by_msid = {p.moysklad_id: p for p in db.query(Product).all()}
    reattached = 0
    for row in manifest:
        p = by_msid.get(row["moysklad_id"])
        if p is None or p.images_manual or p.images:
            continue
        imgs = [x for x in (row.get("images") or []) if x in on_disk]
        if imgs:
            p.images = imgs
            p.image_url = imgs[0]
            reattached += 1
    if reattached:
        db.commit()
    return reattached


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

        # Пришла ли в ЭТОМ обмене схема флаг-доп-полей (по классификатору). Если да — флаг
        # пересчитываем для КАЖДОГО товара, в т.ч. сбрасываем снятый в МойСклад (значение
        # свойства у товара исчезает из выгрузки). «Дозаливка» без схемы флаги не трогает.
        new_defined = _prop_defined(catalog.property_names, _NEW_PATTERNS)
        sale_defined = _prop_defined(catalog.property_names, _SALE_PATTERNS)
        hot_defined = _prop_defined(catalog.property_names, _HOT_PATTERNS)

        # Товары, у которых обмен просит УБРАТЬ фото — не применяем сразу, а копим и в конце
        # пропускаем через предохранитель (MAX_IMAGE_CLEARS). Добавление/замену фото применяем
        # сразу (потери нет). images_touched → нужно ли обновить слепок привязок в конце.
        pending_image_clears: list[Product] = []
        images_touched = False

        # Удаление фото ловим ТОЛЬКО в дельта-выгрузке (<Каталог СодержитТолькоИзменения="true">).
        # На этом аккаунте МойСклад так устроен (проверено на проде): ПОЛНЫЙ каталог (false) несёт
        # весь ассортимент, но БЕЗ единой <Картинка> — там отсутствие тега НЕ значит удаление, фото
        # не трогаем. А дельта (true) — изменённые товары ПОЛНОЙ карточкой (с <Картинка>, если фото
        # есть); тут «был тег → пропал» = фото удалили в МойСклад (пустой тег МойСклад не шлёт).
        # Всё стирание всё равно проходит через предохранитель MAX_IMAGE_CLEARS ниже.
        changes_only = catalog.changes_only

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
                    is_new=_attr_flag(parsed_product.attributes, _NEW_PATTERNS),
                    is_sale=_attr_flag(parsed_product.attributes, _SALE_PATTERNS),
                    is_hot=_attr_flag(parsed_product.attributes, _HOT_PATTERNS),
                    price=parsed_product.price,
                    stock=parsed_product.stock,
                    category_id=cat_id,
                    synced_at=_utcnow(),
                )
                db.add(product)
                existing_products[parsed_product.moysklad_id] = product
                created += 1
                if product.images:
                    images_touched = True   # новый товар с фото → обновим слепок привязок
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
                # Флаги «Новинка»/«Распродажа»/«Убойные» пересчитываем, когда обмен принёс схему
                # этого доп-поля (`*_defined`) — тогда снятая в МойСклад галочка тоже снимется у нас.
                # Плюс запасной случай: товар несёт включённый флаг в атрибутах, даже если схему
                # почему-то не прислали (тогда только СТАВИМ True, снять без схемы не рискуем).
                new_flag = _attr_flag(parsed_product.attributes, _NEW_PATTERNS)
                sale_flag = _attr_flag(parsed_product.attributes, _SALE_PATTERNS)
                hot_flag = _attr_flag(parsed_product.attributes, _HOT_PATTERNS)
                if (new_defined or new_flag) and product.is_new != new_flag:
                    product.is_new = new_flag; changed = True
                if (sale_defined or sale_flag) and product.is_sale != sale_flag:
                    product.is_sale = sale_flag; changed = True
                if (hot_defined or hot_flag) and product.is_hot != hot_flag:
                    product.is_hot = hot_flag; changed = True
                # Картинки трогаем ПОФАЙЛОВО — только если У ЭТОГО товара в import.xml реально
                # был тег <Картинка> (или пришли имена файлов). Раньше решали «по всему раунду»
                # (round_has_images): если в заходе была хоть одна картинка, у ВСЕХ товаров без
                # <Картинка> фото затиралось в ноль → 350 осиротевших файлов (инцидент 29.06.2026).
                # Теперь: тег заполнен → ставим; тег пустой (has_image_field, images=[]) → удаление,
                # чистим; тега не было → НЕ трогаем (обычный import.xml чужие фото не сбрасывает).
                if not product.images_manual:
                    if parsed_product.has_image_field or parsed_product.images:
                        imgs = [image_name(x) for x in parsed_product.images]
                        if product.images != imgs:
                            if imgs:
                                # добавление/замена фото — применяем сразу, потери нет
                                product.images = imgs
                                product.image_url = imgs[0]
                                images_touched = True
                                changed = True
                            elif product.images:
                                # обмен просит СТЕРЕТЬ фото (пустой тег) — под предохранитель (ниже)
                                pending_image_clears.append(product)
                    elif changes_only and product.images:
                        # Дельта-выгрузка карточки товара, но тега <Картинка> БОЛЬШЕ нет → фото
                        # удалили в МойСклад. Откладываем под предохранитель: единичные удаления
                        # применятся, массовое стирание (сбой выгрузки) — нет. Полный каталог
                        # (changes_only=False) сюда не попадает — там фото не выгружаются вовсе.
                        pending_image_clears.append(product)
                # Отметку последнего обмена ставим всегда (товар «виден» в выгрузке),
                # а в счётчик «Обновлено» попадают только реально изменившиеся.
                product.synced_at = _utcnow()
                if changed:
                    updated += 1

        # ── Предохранитель от массового стирания фото ─────────────────────────
        # Немного «стираний» (<= MAX_IMAGE_CLEARS) — это реальные удаления, применяем.
        # Много — это аномалия/сбой выгрузки (инцидент 29.06.2026): НЕ стираем, фото остаются,
        # пишем предупреждение в журнал. Восстанавливать потом ничего не придётся.
        image_clear_warning: str | None = None
        if len(pending_image_clears) <= MAX_IMAGE_CLEARS:
            for p in pending_image_clears:
                p.images = []
                p.image_url = None
                updated += 1
                images_touched = True
        else:
            image_clear_warning = (
                f"⚠️ Предохранитель фото: отменено массовое стирание у "
                f"{len(pending_image_clears)} товаров (похоже на сбой выгрузки, а не реальные "
                f"удаления). Фото сохранены."
            )
            print("upsert_catalog:", image_clear_warning, flush=True)

        db.commit()

        log.status = "success"
        log.products_created = created
        log.products_updated = updated
        log.error_message = image_clear_warning
        log.finished_at = _utcnow()
        db.commit()

        # Слепок привязок фото — только если фото в этом обмене реально менялись.
        # Это наша «страховка»: из него можно восстановить фото без выгрузки из МойСклад.
        if images_touched:
            try:
                write_image_manifest(db)
            except Exception as exc:   # слепок не критичен — обмен уже зафиксирован
                print("upsert_catalog: write_image_manifest error:", exc, flush=True)

    except Exception as exc:
        db.rollback()
        log.status = "error"
        log.error_message = str(exc)
        log.finished_at = _utcnow()
        db.commit()
        raise

    return log

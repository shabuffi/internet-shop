import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import select, func, case

from app.db.session import get_db
from app.db.models.product import Product, Category
from app.db.models.promo import PromoCategory, MoySkladProperty, product_promo_categories
from app.db.models.admin import ShopSettings
from app.schemas.product import ProductOut, ProductListOut, CategoryOut, TopCategoryOut
from app.services.media_storage import read_image
from app.services.pricing import adjusted_price, percent_for as _percent_for
from app.services import promo_service, search as search_service, top_categories
from app.api.v1.endpoints.auth import get_optional_user
from app.db.models.user import User

router = APIRouter(prefix="/products", tags=["Products"])

# Браузерный кэш картинки. max-age держим небольшим, а свежесть гарантируем ETag'ом по
# имени файла: при замене фото в МойСклад имя файла меняется → ETag другой → браузер
# подтягивает новое (не «залипает» на старом до суток). stale-while-revalidate отдаёт
# кэш мгновенно и обновляет в фоне.
_IMG_TTL = 600                # 10 минут «свежо без вопросов»
_IMG_SWR = 86400             # сутки фонового обновления

# --- Порядок категорий (единый источник правды для фильтра и сортировки «По категориям») ---
# Иерархия у этого каталога зашита в числовом код-префиксе имени («001», «001.02»), а не в
# parent_id. Эти три чистые функции задают: код категории, алфавитный ключ и ключ «как в
# МойСклад» (по сегментам кода как по числам). Их используют и list_categories, и сортировка
# товаров — правило порядка должно быть одно.
def _cat_code(name: str) -> str | None:
    m = re.match(r"\s*([\d.]+)", name)
    return m.group(1).rstrip(".") if m and m.group(1).strip(".") else None


def _cat_sort_key(name: str) -> str:
    # Имя без числового код-префикса (как cleanCategoryName на фронте), в нижнем регистре,
    # ё→е — для стабильной алфавитной сортировки по-русски.
    cleaned = re.sub(r"^\d[\d.]*\.[\d.]*\s+", "", name).strip() or name
    return cleaned.casefold().replace("ё", "е")


def _cat_ms_key(name: str) -> tuple:
    # Числовой код-префикс кодирует порядок из МойСклад — сравниваем сегменты как числа.
    # Категории без кода — в конец, между собой по алфавиту (стабильно).
    code = _cat_code(name)
    if code:
        try:
            return (0, tuple(int(s) for s in code.split(".") if s))
        except ValueError:
            pass
    return (1, _cat_sort_key(name))


def _category_order_index(db: Session) -> dict[str, int]:
    """Позиция каждой категории в порядке показа витрины — тот же порядок, что отдаёт
    ``list_categories`` (дерево: дети идут за родителем; порядок уровня — режим ``category_sort``
    из настроек: код МойСклад или алфавит). Нужна для сортировки товаров «По категориям».

    Фильтр по остатку тут не нужен: пустые категории просто не встретятся среди товаров.

    Returns:
        ``{category_id: порядковый_номер}`` — меньше номер, раньше показывается.
    """
    cats = db.scalars(select(Category)).all()

    by_code: dict[str, Category] = {}
    for c in cats:
        code = _cat_code(c.name)
        if code:
            by_code[code] = c

    def parent_code(code: str) -> str | None:
        segs = code.split(".")
        while len(segs) > 1:
            segs = segs[:-1]
            p = ".".join(segs)
            if p in by_code:
                return p
        return None

    info: dict[str, tuple[str | None, tuple, str]] = {}
    for c in cats:
        code = _cat_code(c.name)
        pc = parent_code(code) if code else None
        info[c.id] = (by_code[pc].id if pc else None, _cat_ms_key(c.name), _cat_sort_key(c.name))

    children: dict[str | None, list[str]] = {}
    for cid, (pid, _m, _k) in info.items():
        children.setdefault(pid, []).append(cid)

    mode_row = db.get(ShopSettings, "category_sort")
    mode = mode_row.value if mode_row else "moysklad"
    key_idx = 2 if mode == "alpha" else 1  # info[..][2] — алфавит, [1] — порядок МойСклад

    order: dict[str, int] = {}

    def walk(cid: str) -> None:
        order[cid] = len(order)
        for ch in sorted(children.get(cid, []), key=lambda x: info[x][key_idx]):
            walk(ch)

    for cid in sorted(children.get(None, []), key=lambda x: info[x][key_idx]):
        walk(cid)
    return order


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    """Возвращает категории с вычисленной вложенностью (для фильтра на витрине).

    У этого каталога МойСклад не передаёт связь родитель-ребёнок (``parent_id``
    в БД пуст), но иерархия зашита в числовом коде названия: ``001.01`` —
    подкатегория ``001``, ``00001.02`` — подкатегория ``00001`` и т.д. Здесь мы
    восстанавливаем родителя (код без последнего сегмента, поднимаясь до первого
    существующего кода) и глубину, и сортируем так, чтобы дети шли за родителем.

    Args:
        db: Сессия БД.

    Returns:
        Список категорий с ``parent_id``/``depth``, упорядоченный для показа деревом.
    """
    cats = db.scalars(select(Category)).all()

    # Число товаров «как на витрине» (активные, с остатком) по каждой категории — тем же
    # правилом, что и список товаров (is_active + stock > 0). Пустые категории (например
    # «Распродажа», из которой убрали весь товар) на витрине не показываем — иначе фильтр
    # предлагает раздел, в котором заведомо ничего нет.
    count_rows = db.execute(
        select(Product.category_id, func.count())
        .where(Product.is_active == True, Product.stock > 0, Product.category_id.isnot(None))
        .group_by(Product.category_id)
    ).all()
    counts: dict[str, int] = {cid: n for cid, n in count_rows}

    by_code: dict[str, Category] = {}
    for c in cats:
        code = _cat_code(c.name)
        if code:
            by_code[code] = c

    def parent_code(code: str) -> str | None:
        segs = code.split(".")
        while len(segs) > 1:
            segs = segs[:-1]
            p = ".".join(segs)
            if p in by_code:
                return p
        return None

    def depth_of(code: str | None) -> int:
        d = 0
        while code is not None:
            code = parent_code(code)
            if code is not None:
                d += 1
        return d

    # Ключи порядка (алфавит / «как в МойСклад») — общие с сортировкой товаров: _cat_sort_key /
    # _cat_ms_key на уровне модуля.
    # Режим сортировки категорий из настроек магазина: «moysklad» (порядок МойСклад,
    # рекомендуемый) или «alpha» (по алфавиту). Влияет только на порядок вывода.
    mode_row = db.get(ShopSettings, "category_sort")
    mode = mode_row.value if mode_row else "moysklad"
    key_idx = 2 if mode == "alpha" else 4  # info[..][2] — алфавит, [4] — порядок МойСклад

    # parent_id / depth для каждой категории (иерархия — из кода; без кода — корень)
    info: dict[str, tuple[str | None, int, str, Category, tuple]] = {}
    for c in cats:
        code = _cat_code(c.name)
        if code:
            pc = parent_code(code)
            info[c.id] = (by_code[pc].id if pc else None, depth_of(code), _cat_sort_key(c.name), c, _cat_ms_key(c.name))
        else:
            info[c.id] = (None, 0, _cat_sort_key(c.name), c, _cat_ms_key(c.name))

    children: dict[str | None, list[str]] = {}
    for cid, (pid, _d, _k, _c, _m) in info.items():
        children.setdefault(pid, []).append(cid)

    # Обход в глубину: на каждом уровне сортируем детей по алфавиту (Python sort стабилен),
    # дети идут сразу за родителем — дерево сохраняется, но упорядочено по алфавиту.
    out: list[CategoryOut] = []

    def emit(cid: str) -> list[CategoryOut]:
        # Собираем поддерево: сначала дети (в алфавитном порядке), затем решаем, показывать ли
        # саму категорию. Категорию скрываем ТОЛЬКО если в ней нет товара И все её подкатегории
        # тоже пусты — так пустой раздел-родитель с непустым ребёнком не исчезнет, а его ребёнок
        # не осиротеет. Возвращаем строки поддерева (пусто — если весь узел скрыт).
        pid2, depth, _k, c, _m = info[cid]
        child_rows: list[CategoryOut] = []
        for ch in sorted(children.get(cid, []), key=lambda x: info[x][key_idx]):
            child_rows += emit(ch)
        if counts.get(cid, 0) == 0 and not child_rows:
            return []
        return [CategoryOut(id=c.id, name=c.name, parent_id=pid2, depth=depth, icon=c.icon), *child_rows]

    for cid in sorted(children.get(None, []), key=lambda x: info[x][key_idx]):
        out += emit(cid)
    return out


@router.get("/top-categories", response_model=list[TopCategoryOut])
def list_top_categories(db: Session = Depends(get_db)):
    """Блок «Топ категорий» главной — из настроек админки (не из кода).

    Отдаёт только заполненные слоты с существующей категорией, в порядке слотов. Ссылку и имя
    строит витрина по ``category_id`` (раздел каталога МойСклад); ``icon`` — своя картинка или
    ``None``. Пусто → главная просто не покажет блок. См. :mod:`app.services.top_categories`.
    """
    return top_categories.resolve_public(db)


def _old_price_field(db: Session) -> str | None:
    """Актуальное имя доп-поля со «старой ценой» (или None — фича не настроена).

    В настройке лежит ИД строки реестра, а имя берётся из реестра — как и у промо-категорий.
    Поэтому переименование поля в МойСклад не рвёт привязку: имя подтягивается само. Строка
    реестра пропала (её не удаляют, но подстрахуемся) → фича просто спит.
    """
    row = db.get(ShopSettings, promo_service.OLD_PRICE_SETTING_KEY)
    prop_id = (row.value or "").strip() if row else ""
    if not prop_id:
        return None
    prop = db.get(MoySkladProperty, prop_id)
    return prop.name if prop else None


def _hidden_attr_names(db: Session, old_price_field: str | None) -> frozenset[str]:
    """Имена служебных доп-полей, которые НЕ показываем в характеристиках: поля всех
    промо-категорий + «Старая цена». Данные в БД сохраняются — прячем только вывод.

    Имена берём ИЗ РЕЕСТРА (join по source_field_id), а не из кэша на категории: иначе после
    переименования поля в МойСклад фильтр отстал бы и служебное поле вылезло бы в характеристики.
    """
    fields = {
        name for (name,) in db.query(MoySkladProperty.name)
        .join(PromoCategory, PromoCategory.source_field_id == MoySkladProperty.id)
        .all() if name
    }
    if old_price_field:
        fields.add(old_price_field)
    return frozenset(fields)


def _product_out(product: Product, percent=None, hidden_names: frozenset[str] = frozenset(),
                 old_price_field: str | None = None) -> ProductOut:
    """Сериализует товар в :class:`ProductOut` с витринной ценой и промо-полями.

    Цена = базовая цена МойСклад + корректировка (наценка гостя / скидка вошедшего).
    promo_slugs/old_price/is_* и скрытие служебных доп-полей вычисляются здесь — единая точка.
    """
    po = ProductOut.model_validate(product)
    po.price = adjusted_price(po.price, percent)

    # Активные промо-категории товара по возрастанию priority (первая — «основная»: её секция и
    # её бейдж). Именно priority, а не display_order: порядок показа в меню и приоритет
    # эксклюзивности — разные вещи (в старом коде меню hot→novinki→special, приоритет
    # hot>special>novinki).
    active = sorted((c for c in product.promo_categories if c.is_active),
                    key=lambda c: c.priority)
    po.promo_slugs = [c.slug for c in active]
    slugs = set(po.promo_slugs)
    # Deprecated-шим для обратной совместимости фронта.
    po.is_hot = "hot" in slugs
    po.is_sale = "special" in slugs
    po.is_new = "novinki" in slugs

    # «Старая цена»: показываем зачёркнутой, если она есть в доп-полях, больше текущей и хотя бы
    # одна активная категория товара включила показ старой цены. Приводим к той же ценовой базе.
    op = promo_service.old_price_from_attributes(product.attributes, old_price_field)
    if op is not None and any(c.show_old_price for c in active):
        op_adj = adjusted_price(op, percent)
        if op_adj > po.price:
            po.old_price = op_adj

    # Прячем служебные доп-поля из характеристик (данные в БД остаются нетронутыми).
    if po.attributes and hidden_names:
        po.attributes = [a for a in po.attributes
                         if (a.get("name") or "").strip() not in hidden_names] or None
    return po


@router.get("", response_model=ProductListOut)
def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category_id: str | None = Query(None),
    search: str | None = Query(None),
    sort: str | None = Query(None),
    with_photo: bool = Query(False),
    featured: str | None = Query(None),   # slug активной промо-категории (hot / novinki / special / …)
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """Возвращает список активных товаров с пагинацией, фильтром, поиском и сортировкой.

    Args:
        page: Номер страницы (с 1).
        page_size: Размер страницы (1–100).
        category_id: Если задан — фильтр по категории.
        search: Если задан — поиск по названию или артикулу (правила — в
            :mod:`app.services.search`). Если точных совпадений нет, выдача добирается
            «мягким» поиском (подстрокой) и сортируется по качеству совпадения.
        sort: Порядок: ``price_asc`` / ``price_desc`` / ``category`` / ``name`` (по умолчанию —
            name). При сортировке по имени отбрасываем код склада в начале («с1/с2 …»).
            ``category`` — блоками в порядке показа категорий, внутри блока по алфавиту.
        db: Сессия БД.

    Returns:
        :class:`ProductListOut` — товары текущей страницы + метаданные пагинации
        (total, page, page_size, pages).
    """
    query = (
        select(Product)
        .options(joinedload(Product.category), selectinload(Product.promo_categories))
        # Товары с остатком 0 на витрине не показываем (в админке они остаются)
        .where(Product.is_active == True, Product.stock > 0)
    )

    if category_id:
        # Поддержка нескольких категорий через запятую (плитки-группы на главной:
        # «Бытовая химия» = стирка+чистящие+посуда+… ). Одиночная категория из
        # выпадающего фильтра — это просто список из одного id.
        ids = [c for c in category_id.split(",") if c]
        query = query.where(Product.category_id.in_(ids))

    if with_photo:
        query = query.where(Product.image_url.isnot(None), Product.image_url != "")

    # Фильтр по промо-категории (slug). Эксклюзивность секций сохранена: товар показываем
    # только в секции его «основной» (сильнейшей по priority) активной категории —
    # из более слабых секций исключаем. Неизвестный/неактивный slug → пустая выдача.
    if featured is not None:
        target = db.query(PromoCategory).filter(
            PromoCategory.slug == featured, PromoCategory.is_active == True
        ).first()
        if target is None:
            return ProductListOut(items=[], total=0, page=page, page_size=page_size, pages=1)
        members = select(product_promo_categories.c.product_id).where(
            product_promo_categories.c.promo_category_id == target.id
        )
        # Более «сильные» активные категории (меньший priority) — товар уходит в них.
        stronger = (
            select(product_promo_categories.c.product_id)
            .join(PromoCategory, PromoCategory.id == product_promo_categories.c.promo_category_id)
            .where(PromoCategory.is_active == True,
                   PromoCategory.priority < target.priority)
        )
        query = query.where(Product.id.in_(members), Product.id.notin_(stronger))

    # Поиск применяем ПОСЛЕДНИМ и запоминаем выборку без него (`unsearched`): если строгий поиск
    # (по началу слова) не найдёт НИЧЕГО, переспросим мягче — подстрокой. Так в обычной выдаче
    # нет мусора («ель» — это ёлки, а не гель с наполнителем), но и тупика «ничего не найдено»
    # почти нет: «бложка» найдёт «Обложка».
    unsearched = query
    strict_cond = search_service.build_filter(search, Product.name, Product.article) if search else None
    if strict_cond is not None:
        query = query.where(strict_cond)

    # Имя без кода склада «с1/с2 …» и без префикса «ЧЗ» (Честный знак) —
    # для сортировки и оценки релевантности (товар «ЧЗ Апельсины» сортируется под «А»).
    clean_name = func.regexp_replace(Product.name, r"^[сcСC]\s?\d+[.\s]+\s*", "", "i")
    clean_name = func.regexp_replace(clean_name, r"^\s*ЧЗ[\s.:\-]*", "", "i")
    if sort == "price_asc":
        order_cols = [Product.price.asc()]
    elif sort == "price_desc":
        order_cols = [Product.price.desc()]
    elif sort == "category":
        # «По категориям»: товары идут блоками в порядке показа категорий (тот же порядок, что в
        # фильтре и меню), внутри блока — по алфавиту. Позицию категории берём из общего источника
        # (_category_order_index). Товары без категории / вне индекса — в конец.
        order_index = _category_order_index(db)
        if order_index:
            cat_pos = case(
                *[(Product.category_id == cid, pos) for cid, pos in order_index.items()],
                else_=len(order_index),
            )
            order_cols = [cat_pos, clean_name.asc()]
        else:
            order_cols = [clean_name.asc()]
    elif search:
        # Релевантность: точное совпадение названия → название начинается с запроса → прочее.
        order_cols = [search_service.relevance_case(search, clean_name), clean_name.asc()]
    else:
        order_cols = [clean_name.asc()]
    # При ПРОСМОТРЕ каталога сверху идут товары «сильнейших» промо-категорий (меньший priority),
    # затем остальные. Ранг = минимальный priority среди активных категорий товара.
    # НЕ применяем промо-ранг в двух случаях:
    #   * явная сортировка по цене — пользователь хочет чистый порядок по цене;
    #   * ПОИСК — там порядок задаёт качество совпадения. Иначе промо-товар, подходящий под
    #     запрос хуже, оказывался бы выше того, что человек искал.
    if sort not in ("price_asc", "price_desc") and not search:
        rank_subq = (
            select(func.min(PromoCategory.priority))
            .select_from(product_promo_categories)
            .join(PromoCategory, PromoCategory.id == product_promo_categories.c.promo_category_id)
            .where(product_promo_categories.c.product_id == Product.id,
                   PromoCategory.is_active == True)
            .scalar_subquery()
        )
        featured_rank = func.coalesce(rank_subq, 9999)
        order_cols = [featured_rank, *order_cols]
    query = query.order_by(*order_cols)

    def _count(q) -> int:
        return db.scalar(select(func.count()).select_from(q.order_by(None).subquery()))

    total = _count(query)
    # Подстраховка от пустой выдачи: строгий поиск ничего не дал → ищем подстрокой (см. выше).
    # Второй запрос платим ТОЛЬКО когда иначе показали бы «ничего не найдено».
    if total == 0 and strict_cond is not None:
        loose_cond = search_service.build_filter(
            search, Product.name, Product.article, substring=True)
        if loose_cond is not None:
            # Порядок — по качеству совпадения: сначала ранг (целиком → с начала названия →
            # с начала слова → внутри слова), затем позиция вхождения («Обложка для тетрадей»
            # выше «Дневника (мягкая обложка)»). Промо-ранга здесь нет — как и в обычном поиске.
            loose_order = [
                search_service.relevance_case(search, clean_name),
                search_service.match_position(search, clean_name),
                clean_name.asc(),
            ]
            loose_query = unsearched.where(loose_cond).order_by(*loose_order)
            loose_total = _count(loose_query)
            if loose_total:
                query, total = loose_query, loose_total
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()

    percent = _percent_for(user)
    old_price_field = _old_price_field(db)
    hidden = _hidden_attr_names(db, old_price_field)
    return ProductListOut(
        items=[_product_out(p, percent, hidden, old_price_field) for p in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


@router.get("/{product_id}/image")
def get_product_image(request: Request, product_id: str, n: int = 0, db: Session = Depends(get_db)):
    """Отдаёт изображение товара из медиа-хранилища.

    Картинки приходят файлами в обмене CommerceML (см. exchange.py) и лежат в
    ``MEDIA_DIR``. У товара может быть несколько картинок (``Product.images``); ``n`` —
    индекс нужной (0 — первая, она же ``image_url``). Отдаём байты напрямую с браузерным
    кэшем, без обращения к МойСклад и без пароля аккаунта.

    Args:
        product_id: Внутренний UUID товара.
        n: Индекс картинки в галерее (по умолчанию 0 — первая).
        db: Сессия БД.

    Returns:
        :class:`Response` с байтами картинки и заголовком кэша.

    Raises:
        HTTPException: 404, если товар/картинка не найдены или файла нет в хранилище.
    """
    # Берём только имена файлов (не ORM-сущность): дальше БД не нужна. Сессию закрываем
    # сразу — иначе соединение остаётся занятым (idle in transaction) всё время чтения
    # файла с диска. Браузер тянет картинки каталога десятками параллельно (HTTP/2), и
    # такие «простаивающие занятыми» соединения исчерпывают пул: SSR-запросы витрины
    # встают в очередь на pool.acquire() и падают по таймауту. db.close() идемпотентен —
    # повторный close() из get_db() безвреден.
    row = db.execute(
        select(Product.images, Product.image_url).where(
            Product.id == product_id, Product.is_active == True
        )
    ).first()
    db.close()

    if row is None:
        raise HTTPException(status_code=404, detail="Изображение не найдено")

    images = row.images or ([row.image_url] if row.image_url else [])
    if not images or n < 0 or n >= len(images):
        raise HTTPException(status_code=404, detail="Изображение не найдено")

    # ETag = имя файла картинки: меняется при замене фото в МойСклад. Если браузер
    # прислал тот же If-None-Match — отдаём 304 без перекачки байтов.
    etag = f'"{images[n]}"'
    cache_headers = {
        "Cache-Control": f"public, max-age={_IMG_TTL}, stale-while-revalidate={_IMG_SWR}",
        "ETag": etag,
    }
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=cache_headers)

    result = read_image(images[n])
    if result is None:
        raise HTTPException(status_code=404, detail="Изображение не найдено")
    data, content_type = result
    return Response(content=data, media_type=content_type, headers=cache_headers)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db: Session = Depends(get_db),
                user: User | None = Depends(get_optional_user)):
    """Возвращает карточку одного активного товара по внутреннему ID.

    Args:
        product_id: Внутренний UUID товара.
        db: Сессия БД.

    Returns:
        Товар (:class:`ProductOut`) с подгруженной категорией.

    Raises:
        HTTPException: 404, если товар не найден или неактивен.
    """
    product = db.scalar(
        select(Product)
        .options(joinedload(Product.category), selectinload(Product.promo_categories))
        .where(Product.id == product_id, Product.is_active == True)
    )
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    old_price_field = _old_price_field(db)
    return _product_out(product, _percent_for(user),
                        _hidden_attr_names(db, old_price_field), old_price_field)

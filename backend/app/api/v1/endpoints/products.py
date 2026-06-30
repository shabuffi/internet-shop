import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func, or_, case

from app.db.session import get_db
from app.db.models.product import Product, Category
from app.schemas.product import ProductOut, ProductListOut, CategoryOut
from app.services.media_storage import read_image
from app.services.pricing import adjusted_price
from app.api.v1.endpoints.auth import get_optional_user
from app.db.models.user import User

router = APIRouter(prefix="/products", tags=["Products"])

# Браузерный кэш картинки. max-age держим небольшим, а свежесть гарантируем ETag'ом по
# имени файла: при замене фото в МойСклад имя файла меняется → ETag другой → браузер
# подтягивает новое (не «залипает» на старом до суток). stale-while-revalidate отдаёт
# кэш мгновенно и обновляет в фоне.
_IMG_TTL = 600                # 10 минут «свежо без вопросов»
_IMG_SWR = 86400             # сутки фонового обновления

# Раскладка клавиатуры: один и тот же физический ряд клавиш в EN (QWERTY) и RU (ЙЦУКЕН).
# Нужно для поиска при «неправильной раскладке»: ввёл "vjq" → ищем ещё и "мой", и наоборот.
_EN_KEYS = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./"
_RU_KEYS = "ёйцукенгшщзхъфывапролджэячсмитьбю."
_EN2RU = {e: r for e, r in zip(_EN_KEYS, _RU_KEYS)}
_RU2EN = {r: e for e, r in zip(_EN_KEYS, _RU_KEYS)}


def _layout_variants(s: str) -> list[str]:
    """Возвращает варианты запроса с учётом неправильной раскладки: исходный + EN→RU + RU→EN.

    Только реально отличающиеся непустые варианты (без дублей).
    """
    s = s.strip()
    if not s:
        return []
    low = s.lower()
    variants: list[str] = []
    for v in (s, "".join(_EN2RU.get(c, c) for c in low), "".join(_RU2EN.get(c, c) for c in low)):
        if v and v not in variants:
            variants.append(v)
    return variants


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

    def code_of(name: str) -> str | None:
        m = re.match(r"\s*([\d.]+)", name)
        return m.group(1).rstrip(".") if m and m.group(1).strip(".") else None

    by_code: dict[str, Category] = {}
    for c in cats:
        code = code_of(c.name)
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

    # Категории с кодом — в порядке кода (дети идут за родителем); без кода — по имени в конце.
    out: list[CategoryOut] = []
    for code in sorted(by_code.keys()):
        c = by_code[code]
        pc = parent_code(code)
        out.append(CategoryOut(
            id=c.id, name=c.name,
            parent_id=by_code[pc].id if pc else None,
            depth=depth_of(code),
        ))
    for c in sorted((c for c in cats if code_of(c.name) is None), key=lambda c: c.name):
        out.append(CategoryOut(id=c.id, name=c.name, parent_id=None, depth=0))
    return out


def _percent_for(user: User | None):
    """Процент корректировки цены: персональная скидка вошедшего, иначе наценка гостя."""
    return user.discount_percent if user is not None else None


def _product_out(product: Product, percent=None) -> ProductOut:
    """Сериализует товар в :class:`ProductOut` с витринной ценой.

    Цена = базовая цена МойСклад + корректировка: для гостя — наценка
    ``DEFAULT_MARKUP_PERCENT``, для вошедшего — его ``discount_percent``.
    """
    po = ProductOut.model_validate(product)
    po.price = adjusted_price(po.price, percent)
    return po


@router.get("", response_model=ProductListOut)
def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category_id: str | None = Query(None),
    search: str | None = Query(None),
    sort: str | None = Query(None),
    with_photo: bool = Query(False),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """Возвращает список активных товаров с пагинацией, фильтром, поиском и сортировкой.

    Args:
        page: Номер страницы (с 1).
        page_size: Размер страницы (1–100).
        category_id: Если задан — фильтр по категории.
        search: Если задан — поиск без учёта регистра по названию или артикулу.
        sort: Порядок: ``price_asc`` / ``price_desc`` / ``name`` (по умолчанию — name).
            При сортировке по имени отбрасываем код склада в начале («с1/с2 …»).
        db: Сессия БД.

    Returns:
        :class:`ProductListOut` — товары текущей страницы + метаданные пагинации
        (total, page, page_size, pages).
    """
    query = (
        select(Product)
        .options(joinedload(Product.category))
        # Товары с остатком 0 на витрине не показываем (в админке они остаются)
        .where(Product.is_active == True, Product.stock > 0)
    )

    if category_id:
        # Поддержка нескольких категорий через запятую (плитки-группы на главной:
        # «Бытовая химия» = стирка+чистящие+посуда+… ). Одиночная категория из
        # выпадающего фильтра — это просто список из одного id.
        ids = [c for c in category_id.split(",") if c]
        query = query.where(Product.category_id.in_(ids))

    if search:
        # Точный поиск: совпадение по НАЧАЛУ слова, а не подстрока внутри слова — чтобы
        # «тёрка» не находила «стёрка», а «сорти» — «ассорти». Граница слова = начало строки
        # или не-буква/цифра (а-яё включены явно, чтобы не зависеть от locale БД). Учитываем
        # неправильную раскладку (EN↔RU). Артикул — короткий код: ищем с начала.
        conds = []
        for variant in _layout_variants(search):
            v = re.escape(variant)
            conds.append(Product.name.op("~*")(rf"(^|[^[:alnum:]а-яё]){v}"))
            conds.append(Product.article.ilike(f"{variant}%"))
        if conds:
            query = query.where(or_(*conds))

    if with_photo:
        query = query.where(Product.image_url.isnot(None), Product.image_url != "")

    # Имя без кода склада «с1/с2 …» и без префикса «ЧЗ» (Честный знак) —
    # для сортировки и оценки релевантности (товар «ЧЗ Апельсины» сортируется под «А»).
    clean_name = func.regexp_replace(Product.name, r"^[сcСC]\s?\d+[.\s]+\s*", "", "i")
    clean_name = func.regexp_replace(clean_name, r"^\s*ЧЗ[\s.:\-]*", "", "i")
    if sort == "price_asc":
        query = query.order_by(Product.price.asc())
    elif sort == "price_desc":
        query = query.order_by(Product.price.desc())
    elif search:
        # Релевантность: точное совпадение названия → название начинается с запроса → прочее.
        q = search.strip()
        relevance = case(
            (func.lower(clean_name) == q.lower(), 0),
            (clean_name.op("~*")(rf"^{re.escape(q)}"), 1),
            else_=2,
        )
        query = query.order_by(relevance, clean_name.asc())
    else:
        query = query.order_by(clean_name.asc())

    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()

    percent = _percent_for(user)
    return ProductListOut(
        items=[_product_out(p, percent) for p in items],
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
    product = db.scalar(
        select(Product).where(Product.id == product_id, Product.is_active == True)
    )
    if not product:
        raise HTTPException(status_code=404, detail="Изображение не найдено")

    images = product.images or ([product.image_url] if product.image_url else [])
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
        .options(joinedload(Product.category))
        .where(Product.id == product_id, Product.is_active == True)
    )
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    return _product_out(product, _percent_for(user))

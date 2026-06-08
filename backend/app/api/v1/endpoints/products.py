import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func

from app.core.redis_client import redis_client
from app.db.session import get_db
from app.db.models.product import Product, Category
from app.integrations.moysklad.rest_client import _headers
from app.schemas.product import ProductOut, ProductListOut, CategoryOut
from app.services.media_storage import read_image

router = APIRouter(prefix="/products", tags=["Products"])

# Кэш картинок: байты + content-type в Redis на сутки. Ключ — по нашему product_id.
_IMG_TTL = 86400  # 1 день


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    """Возвращает все категории (для чипов-фильтра на витрине).

    Args:
        db: Сессия БД.

    Returns:
        Список категорий, отсортированный по имени.
    """
    cats = db.scalars(select(Category).order_by(Category.name)).all()
    return cats


@router.get("", response_model=ProductListOut)
def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category_id: str | None = Query(None),
    search: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Возвращает список активных товаров с пагинацией, фильтром и поиском.

    Args:
        page: Номер страницы (с 1).
        page_size: Размер страницы (1–100).
        category_id: Если задан — фильтр по категории.
        search: Если задан — поиск без учёта регистра по названию или артикулу.
        db: Сессия БД.

    Returns:
        :class:`ProductListOut` — товары текущей страницы + метаданные пагинации
        (total, page, page_size, pages).
    """
    query = (
        select(Product)
        .options(joinedload(Product.category))
        .where(Product.is_active == True)
    )

    if category_id:
        query = query.where(Product.category_id == category_id)

    if search:
        pattern = f"%{search}%"
        query = query.where(
            Product.name.ilike(pattern) | Product.article.ilike(pattern)
        )

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()

    return ProductListOut(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


@router.get("/{product_id}/image")
def get_product_image(product_id: str, db: Session = Depends(get_db)):
    """Проксирует изображение товара из МойСклад (их API требует Basic Auth).

    Два слоя кэша: заголовок ``Cache-Control`` для браузера и сами байты в Redis на
    сутки — чтобы не дёргать МойСклад на каждый показ. На ответе виден ``X-Cache``
    (``HIT`` — отдано из Redis, ``MISS`` — скачано из МойСклад и закэшировано).

    Args:
        product_id: Внутренний UUID товара.
        db: Сессия БД.

    Returns:
        :class:`Response` с байтами картинки и заголовками кэша.

    Raises:
        HTTPException: 404, если товар не найден или у него нет картинки;
            502, если картинку не удалось скачать из МойСклад.
    """
    cache_headers = {"Cache-Control": f"public, max-age={_IMG_TTL}"}

    product = db.scalar(
        select(Product).where(Product.id == product_id, Product.is_active == True)
    )
    if not product or not product.image_url:
        raise HTTPException(status_code=404, detail="Изображение не найдено")

    image_url = product.image_url

    # CommerceML: image_url — имя файла в медиа-хранилище (картинка пришла обменом).
    # Отдаём прямо из хранилища, без обращения к МойСклад и без пароля аккаунта.
    if not image_url.startswith(("http://", "https://")):
        result = read_image(image_url)
        if result is None:
            raise HTTPException(status_code=404, detail="Изображение не найдено")
        data, content_type = result
        return Response(content=data, media_type=content_type,
                        headers={**cache_headers, "X-Cache": "FILE"})

    # Временный REST-путь для старых http-URL из прежнего обогащения (удаляется на Этапе 3).
    # Два слоя кэша: байты в Redis на сутки + Cache-Control для браузера.
    data_key = f"image:data:{product_id}"
    ct_key = f"image:ct:{product_id}"
    cached = redis_client.get(data_key)
    if cached:
        ct = redis_client.get(ct_key)
        media_type = ct.decode() if ct else "image/jpeg"
        return Response(content=cached, media_type=media_type,
                        headers={**cache_headers, "X-Cache": "HIT"})
    try:
        r = httpx.get(image_url, headers=_headers(), timeout=10, follow_redirects=True)
        r.raise_for_status()
    except Exception:
        raise HTTPException(status_code=502, detail="Не удалось загрузить изображение")
    content_type = r.headers.get("content-type", "image/jpeg")
    redis_client.set(data_key, r.content, ex=_IMG_TTL)
    redis_client.set(ct_key, content_type, ex=_IMG_TTL)
    return Response(content=r.content, media_type=content_type,
                    headers={**cache_headers, "X-Cache": "MISS"})


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db: Session = Depends(get_db)):
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
    return product

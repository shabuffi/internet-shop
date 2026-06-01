from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func

from app.db.session import get_db
from app.db.models.product import Product
from app.schemas.product import ProductOut, ProductListOut

router = APIRouter(prefix="/products", tags=["Products"])


@router.get("", response_model=ProductListOut)
def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category_id: str | None = Query(None),
    search: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Список товаров с пагинацией, фильтром по категории и поиском."""
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
        pages=max(1, -(-total // page_size)),  # ceil division
    )


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: str, db: Session = Depends(get_db)):
    """Карточка одного товара по ID."""
    product = db.scalar(
        select(Product)
        .options(joinedload(Product.category))
        .where(Product.id == product_id, Product.is_active == True)
    )
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    return product

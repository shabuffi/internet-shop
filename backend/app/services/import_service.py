import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from app.db.models.product import Product, Category, SyncLog
from app.integrations.moysklad.commerceml_parser import ParsedCatalog


def upsert_catalog(db: Session, catalog: ParsedCatalog, source: str = "commerceml") -> SyncLog:
    """
    Сохраняет распарсенный каталог в БД.
    Upsert = INSERT если нет, UPDATE если уже есть (по moysklad_id).
    """
    log = SyncLog(source=source, status="running", started_at=datetime.utcnow())
    db.add(log)
    db.flush()

    created = updated = 0

    try:
        # ─── Категории ────────────────────────────────────────────────────────
        category_id_map: dict[str, str] = {}  # moysklad_id → наш internal id

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
            category_id_map[parsed_cat.moysklad_id] = cat.id

        # Теперь проставляем parent_id
        for parsed_cat in catalog.categories:
            if parsed_cat.parent_id and parsed_cat.parent_id in category_id_map:
                cat = db.query(Category).filter_by(moysklad_id=parsed_cat.moysklad_id).first()
                if cat:
                    cat.parent_id = category_id_map[parsed_cat.parent_id]

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
                    price=parsed_product.price,
                    stock=parsed_product.stock,
                    category_id=cat_id,
                    synced_at=datetime.utcnow(),
                )
                db.add(product)
                created += 1
            else:
                product.name = parsed_product.name
                product.description = parsed_product.description
                product.article = parsed_product.article
                product.code = parsed_product.code
                product.price = parsed_product.price
                product.stock = parsed_product.stock
                product.category_id = cat_id
                product.synced_at = datetime.utcnow()
                updated += 1

        db.commit()

        log.status = "success"
        log.products_created = created
        log.products_updated = updated
        log.finished_at = datetime.utcnow()
        db.commit()

    except Exception as exc:
        db.rollback()
        log.status = "error"
        log.error_message = str(exc)
        log.finished_at = datetime.utcnow()
        db.commit()
        raise

    return log

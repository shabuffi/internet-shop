"""Тесты upsert_catalog — запись распарсенного каталога в БД (создание + обновление)."""

from decimal import Decimal

from app.db.models.product import Product, Category
from app.integrations.moysklad.commerceml_parser import ParsedCatalog, ParsedCategory, ParsedProduct
from app.services.import_service import upsert_catalog


def _catalog(products, categories=None):
    return ParsedCatalog(categories=categories or [], products=products)


def test_upsert_creates_new(db_session):
    cat = _catalog(
        categories=[ParsedCategory(moysklad_id="c1", name="Кремы")],
        products=[ParsedProduct(moysklad_id="p1", name="Крем", price=Decimal("100"),
                                stock=5, article="A1", category_id="c1")],
    )
    log = upsert_catalog(db_session, cat)

    assert log.status == "success"
    assert log.products_created == 1
    assert log.products_updated == 0

    p = db_session.query(Product).filter_by(moysklad_id="p1").first()
    assert p is not None
    assert p.name == "Крем"
    assert p.price == Decimal("100")
    assert p.stock == 5
    # товар привязан к категории (через внутренний id, а не moysklad_id)
    assert p.category is not None
    assert p.category.name == "Кремы"


def test_upsert_updates_existing_by_moysklad_id(db_session):
    """Повторный импорт того же moysklad_id обновляет товар, а не плодит дубль."""
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p1", name="Старое имя", price=Decimal("100"), stock=5)]
    ))
    log2 = upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p1", name="Новое имя", price=Decimal("250"), stock=2)]
    ))

    assert log2.products_created == 0
    assert log2.products_updated == 1

    products = db_session.query(Product).filter_by(moysklad_id="p1").all()
    assert len(products) == 1                 # дубля нет
    assert products[0].name == "Новое имя"
    assert products[0].price == Decimal("250")
    assert products[0].stock == 2


def test_upsert_category_parent_link(db_session):
    """parent_id категории проставляется через внутренние id."""
    upsert_catalog(db_session, _catalog(
        categories=[
            ParsedCategory(moysklad_id="parent", name="Родитель"),
            ParsedCategory(moysklad_id="child", name="Ребёнок", parent_id="parent"),
        ],
        products=[],
    ))
    parent = db_session.query(Category).filter_by(moysklad_id="parent").first()
    child = db_session.query(Category).filter_by(moysklad_id="child").first()
    assert child.parent_id == parent.id


def test_upsert_logs_counts(db_session):
    log = upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="a", name="A"),
        ParsedProduct(moysklad_id="b", name="B"),
    ]))
    assert log.products_created == 2
    assert log.source == "commerceml"
    assert log.finished_at is not None

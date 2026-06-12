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
        products=[ParsedProduct(moysklad_id="p1", name="Старое имя", price=Decimal("100"), stock=5, has_offer=True)]
    ))
    log2 = upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p1", name="Новое имя", price=Decimal("250"), stock=2, has_offer=True)]
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


def test_upsert_preserves_enriched_description_and_image(db_session):
    """Повторный CommerceML-импорт без описания/картинки не должен их затирать.

    Описание и image_url подгружаются из REST (enrichment), а МойСклад в обмене их
    не присылает — поэтому пустые значения из обмена не должны перезаписывать данные.
    """
    # 1. Первый импорт создаёт товар (без описания/картинки — как из обмена)
    upsert_catalog(db_session, _catalog(products=[ParsedProduct(moysklad_id="p1", name="Крем")]))
    # 2. Enrichment заполнил описание и картинку из REST
    p = db_session.query(Product).filter_by(moysklad_id="p1").first()
    p.description = "Описание из REST"
    p.image_url = "https://img/hydra"
    db_session.commit()
    # 3. Повторный обмен снова без описания/картинки — НЕ должен их затереть
    upsert_catalog(db_session, _catalog(products=[ParsedProduct(moysklad_id="p1", name="Крем (обновлён)")]))

    p = db_session.query(Product).filter_by(moysklad_id="p1").first()
    assert p.name == "Крем (обновлён)"          # имя из обмена обновилось
    assert p.description == "Описание из REST"    # описание сохранилось
    assert p.image_url == "https://img/hydra"     # картинка сохранилась


def test_upsert_without_offer_preserves_price_stock(db_session):
    """import.xml без offers (второй заход обмена — только с картинкой) не обнуляет цену/остаток."""
    # Полный заход с offers — цена/остаток выставлены
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p1", name="Крем", price=Decimal("100"), stock=5, has_offer=True)]
    ))
    # Второй заход БЕЗ offers (has_offer=False), но с картинками — цена/остаток сохраняются
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p1", name="Крем с картинкой",
                                images=["import_files/pic.png", "import_files/pic2.png"])]
    ))

    p = db_session.query(Product).filter_by(moysklad_id="p1").first()
    assert p.name == "Крем с картинкой"     # имя обновилось
    assert p.price == Decimal("100")         # цена сохранилась (не обнулилась)
    assert p.stock == 5                       # остаток сохранился
    assert p.image_url == "pic.png"           # первая картинка — image_url (basename)
    assert p.images == ["pic.png", "pic2.png"]  # все картинки сохранены


def test_upsert_does_not_overwrite_manual_images(db_session):
    """Если картинки заданы вручную (images_manual), обмен их не перезаписывает."""
    upsert_catalog(db_session, _catalog(products=[ParsedProduct(moysklad_id="p1", name="X", images=["a.png"])]))
    p = db_session.query(Product).filter_by(moysklad_id="p1").first()
    p.images_manual = True
    p.images = ["manual.png"]
    p.image_url = "manual.png"
    db_session.commit()

    # обмен снова присылает картинки — НЕ должен перезаписать ручные
    upsert_catalog(db_session, _catalog(products=[ParsedProduct(moysklad_id="p1", name="X2", images=["b.png"])]))
    p = db_session.query(Product).filter_by(moysklad_id="p1").first()
    assert p.name == "X2"                 # имя обновилось
    assert p.images == ["manual.png"]     # ручные картинки сохранены
    assert p.image_url == "manual.png"


def test_upsert_logs_counts(db_session):
    log = upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="a", name="A"),
        ParsedProduct(moysklad_id="b", name="B"),
    ]))
    assert log.products_created == 2
    assert log.source == "commerceml"
    assert log.finished_at is not None

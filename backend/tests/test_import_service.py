"""Тесты upsert_catalog — запись распарсенного каталога в БД (создание + обновление)."""

import glob
import os
from decimal import Decimal

import pytest

from app.core.config import settings
from app.db.models.product import Product, Category
from app.integrations.moysklad.commerceml_parser import ParsedCatalog, ParsedCategory, ParsedProduct
from app.services.import_service import (
    upsert_catalog,
    restore_images_from_manifest,
    MAX_IMAGE_CLEARS,
)


@pytest.fixture(autouse=True)
def isolate_media(tmp_path, monkeypatch):
    """Изолируем медиа-хранилище/слепки во временную папку — тесты не пишут в /app/media."""
    d = tmp_path / "media"
    d.mkdir()
    monkeypatch.setattr(settings, "MEDIA_DIR", str(d))
    return d


def _catalog(products, categories=None, property_names=None):
    return ParsedCatalog(categories=categories or [], products=products,
                         property_names=property_names or set())


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


def test_upsert_unchanged_not_counted(db_session):
    """Повторный импорт того же товара БЕЗ изменений → products_updated = 0
    (журнал синхронизации не должен показывать «обновлено» весь каталог зря)."""
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p1", name="Крем", price=Decimal("100"), stock=5, has_offer=True)]
    ))
    log2 = upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p1", name="Крем", price=Decimal("100"), stock=5, has_offer=True)]
    ))
    assert log2.products_created == 0
    assert log2.products_updated == 0          # ничего не изменилось → не считаем


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


def test_upsert_preserves_article_on_image_round(db_session):
    """Второй import.xml без артикула (дозаливка картинок) не должен затирать артикул/код."""
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p1", name="Крем", article="ART-1", code="EA", has_offer=True)]
    ))
    # Заход только с картинкой: артикул/код = None
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p1", name="Крем", images=["pic.png"])]
    ))
    p = db_session.query(Product).filter_by(moysklad_id="p1").first()
    assert p.article == "ART-1"   # артикул сохранился
    assert p.code == "EA"
    assert p.image_url == "pic.png"


def test_upsert_moysklad_photo_overrides_manual_and_unlocks(db_session):
    """Добавление/замена фото в МойСклад ПРИМЕНЯЕТСЯ даже если товар был на ручном управлении
    (images_manual) — и снимает флаг (товар снова под обменом). Так ручное удаление фото не
    блокирует будущие обновления из МойСклад."""
    upsert_catalog(db_session, _catalog(products=[ParsedProduct(moysklad_id="p1", name="X", images=["a.png"], has_image_field=True)]))
    p = db_session.query(Product).filter_by(moysklad_id="p1").first()
    p.images_manual = True
    p.images = ["manual.png"]
    p.image_url = "manual.png"
    db_session.commit()

    # МойСклад присылает НОВОЕ фото — должно примениться поверх ручного и снять флаг
    upsert_catalog(db_session, _catalog(products=[ParsedProduct(moysklad_id="p1", name="X2", images=["b.png"], has_image_field=True)]))
    p = db_session.query(Product).filter_by(moysklad_id="p1").first()
    assert p.name == "X2"                 # имя обновилось
    assert p.images == ["b.png"]          # фото из МойСклад применилось поверх ручного
    assert p.image_url == "b.png"
    assert p.images_manual is False        # товар вернулся под управление обмена


def test_upsert_manual_images_not_cleared_by_deletion_signal(db_session):
    """Ручные картинки НЕ стираются сигналом удаления из обмена (пустой тег / дельта без тега):
    добавление МойСклад их перезаписывает, а удаление — не трогает."""
    upsert_catalog(db_session, _catalog(products=[ParsedProduct(moysklad_id="p1", name="X", images=["a.png"], has_image_field=True)]))
    p = db_session.query(Product).filter_by(moysklad_id="p1").first()
    p.images_manual = True
    p.images = ["manual.png"]
    p.image_url = "manual.png"
    db_session.commit()

    # обмен присылает ПУСТОЙ тег (сигнал удаления) — ручные не трогаем
    upsert_catalog(db_session, _catalog(products=[ParsedProduct(moysklad_id="p1", name="X", has_image_field=True)]))
    p = db_session.query(Product).filter_by(moysklad_id="p1").first()
    assert p.images == ["manual.png"]     # ручные картинки сохранены
    assert p.images_manual is True


def test_upsert_photo_round_does_not_clear_others(db_session):
    """Фото ДРУГОГО товара в заходе не должно затирать мои (баг 350 осиротевших фото).

    Раньше: если в заходе была хоть одна картинка, у всех товаров БЕЗ <Картинка> фото
    обнулялось. Теперь трогаем картинки пофайлово — только у товара с тегом <Картинка>.
    """
    # У обоих товаров уже есть фото
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="a", name="A", image_url="a.png", images=["a.png"], has_image_field=True),
        ParsedProduct(moysklad_id="b", name="B", image_url="b.png", images=["b.png"], has_image_field=True),
    ]))
    # Заход: фото пришло только у A; у B тега <Картинка> НЕТ (has_image_field=False, images=[])
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="a", name="A", images=["a2.png"], has_image_field=True),
        ParsedProduct(moysklad_id="b", name="B"),   # без тега картинки
    ]))

    a = db_session.query(Product).filter_by(moysklad_id="a").first()
    b = db_session.query(Product).filter_by(moysklad_id="b").first()
    assert a.images == ["a2.png"]        # у A фото обновилось
    assert b.images == ["b.png"]          # у B фото СОХРАНИЛОСЬ (не затёрто чужим раундом)
    assert b.image_url == "b.png"


def test_upsert_empty_image_tag_clears(db_session):
    """Пустой тег <Картинка></Картинка> (has_image_field, images=[]) = фото удалили → чистим."""
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="p1", name="X", images=["a.png"], has_image_field=True),
    ]))
    # МойСклад прислал пустой тег <Картинка> → удаление
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="p1", name="X", images=[], has_image_field=True),
    ]))
    p = db_session.query(Product).filter_by(moysklad_id="p1").first()
    assert p.images == []                 # фото очищено
    assert p.image_url is None


def test_mass_image_clear_is_guarded(db_session):
    """Массовое стирание фото (> MAX_IMAGE_CLEARS) не применяется — фото сохраняются + предупреждение."""
    n = MAX_IMAGE_CLEARS + 10
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id=f"p{i}", name=f"T{i}", image_url=f"a{i}.png",
                      images=[f"a{i}.png"], has_image_field=True) for i in range(n)
    ]))
    # обмен присылает пустой <Картинка> у ВСЕХ → попытка массового стирания
    log = upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id=f"p{i}", name=f"T{i}", images=[], has_image_field=True) for i in range(n)
    ]))
    with_img = [p for p in db_session.query(Product).all() if p.images]
    assert len(with_img) == n                      # предохранитель сработал — фото целы
    assert log.error_message and "Предохранитель" in log.error_message


def test_small_image_clear_applies(db_session):
    """Поштучное удаление фото (в пределах порога) применяется нормально."""
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="p1", name="A", image_url="a.png", images=["a.png"], has_image_field=True),
        ParsedProduct(moysklad_id="p2", name="B", image_url="b.png", images=["b.png"], has_image_field=True),
    ]))
    # у p1 фото удалили (пустой тег), p2 не трогаем
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="p1", name="A", images=[], has_image_field=True),
    ]))
    p1 = db_session.query(Product).filter_by(moysklad_id="p1").first()
    p2 = db_session.query(Product).filter_by(moysklad_id="p2").first()
    assert p1.images == [] and p1.image_url is None    # удаление применилось
    assert p2.images == ["b.png"]                       # чужое фото не тронуто


def test_image_manifest_write_and_restore(db_session, isolate_media):
    """Слепок привязок пишется автоматически; из него восстанавливаются отвязавшиеся фото."""
    for fn in ("a.png", "b.png"):
        (isolate_media / fn).write_bytes(b"x")
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="p1", name="A", image_url="a.png", images=["a.png"], has_image_field=True),
        ParsedProduct(moysklad_id="p2", name="B", image_url="b.png", images=["b.png"], has_image_field=True),
    ]))
    # слепок записан (images_touched)
    assert glob.glob(os.path.join(str(isolate_media), "manifests", "images_*.json"))
    # эмулируем «фото отвязалось» у p1
    p1 = db_session.query(Product).filter_by(moysklad_id="p1").first()
    p1.images = []; p1.image_url = None
    db_session.commit()
    # восстановление из последнего слепка (файл a.png ещё на диске)
    assert restore_images_from_manifest(db_session) == 1
    p1 = db_session.query(Product).filter_by(moysklad_id="p1").first()
    assert p1.images == ["a.png"] and p1.image_url == "a.png"


def test_manifest_restore_skips_missing_files_and_manual(db_session, isolate_media):
    """Восстановление не возвращает фото, если файла нет на диске или картинки ведут вручную."""
    # файл на диск НЕ кладём
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="p1", name="A", image_url="gone.png", images=["gone.png"], has_image_field=True),
    ]))
    p1 = db_session.query(Product).filter_by(moysklad_id="p1").first()
    p1.images = []; p1.image_url = None
    db_session.commit()
    assert restore_images_from_manifest(db_session) == 0   # файла нет → не восстанавливаем


def test_upsert_sets_new_sale_flags(db_session):
    """Флаги-галочки из доп-полей МойСклад проставляют is_new / is_sale / is_hot."""
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="n", name="Новинка", attributes=[{"name": "Новинка", "value": "true"}]),
        ParsedProduct(moysklad_id="s", name="Спец", attributes=[{"name": "Распродажа", "value": "да"}]),
        ParsedProduct(moysklad_id="h", name="Убой", attributes=[{"name": "Убойные цены", "value": "1"}]),
        ParsedProduct(moysklad_id="r", name="Обычный", attributes=[{"name": "Количество штук в коробке", "value": "5"}]),
        ParsedProduct(moysklad_id="off", name="Снятый", attributes=[{"name": "Новинка", "value": "false"}]),
    ]))
    g = lambda ms: db_session.query(Product).filter_by(moysklad_id=ms).first()
    assert g("n").is_new is True and g("n").is_sale is False and g("n").is_hot is False
    assert g("s").is_sale is True and g("s").is_new is False
    assert g("h").is_hot is True and g("h").is_new is False and g("h").is_sale is False
    assert g("r").is_new is False and g("r").is_sale is False and g("r").is_hot is False
    assert g("off").is_new is False          # value "false" → флаг не стоит


def test_upsert_flag_recompute_clears_on_update(db_session):
    """Снятая в МойСклад галочка снимается и у нас при следующем обмене со схемой доп-полей."""
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="p1", name="Т", attributes=[{"name": "Новинка", "value": "true"}])]))
    assert db_session.query(Product).filter_by(moysklad_id="p1").first().is_new is True
    # Следующий полный каталог: доп-поле «Новинка» всё ещё в схеме, но значения у товара нет.
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p1", name="Т",
                                attributes=[{"name": "Количество штук в коробке", "value": "5"}])],
        property_names={"Новинка", "Количество штук в коробке"}))
    assert db_session.query(Product).filter_by(moysklad_id="p1").first().is_new is False


def test_upsert_flag_clears_when_it_was_only_attribute(db_session):
    """Регресс: снятая галочка сбрасывает флаг, даже если доп-поле было у товара единственным.

    Раньше пересчёт был под ``if parsed_product.attributes:`` — при снятии единственного
    доп-поля атрибуты товара пустели, пересчёт пропускался и is_sale залипал True. Теперь
    сигнал «пришла схема доп-полей» — ``property_names`` из классификатора, а не атрибуты товара.
    """
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p", name="Т", attributes=[{"name": "Распродажа", "value": "1"}])],
        property_names={"Распродажа"}))
    assert db_session.query(Product).filter_by(moysklad_id="p").first().is_sale is True
    # Галочку сняли → у товара НЕТ атрибутов, но схема доп-поля в обмене есть → флаг сбрасываем.
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p", name="Т", attributes=[])],
        property_names={"Распродажа"}))
    assert db_session.query(Product).filter_by(moysklad_id="p").first().is_sale is False


def test_upsert_flag_not_cleared_without_schema(db_session):
    """«Дозаливка» без схемы доп-полей (напр. второй import.xml с картинкой) флаги НЕ трогает."""
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p", name="Т", attributes=[{"name": "Распродажа", "value": "1"}])],
        property_names={"Распродажа"}))
    assert db_session.query(Product).filter_by(moysklad_id="p").first().is_sale is True
    # Обмен без схемы (property_names пуст) — is_sale остаётся, чтобы не обнулить по ошибке.
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p", name="Т", attributes=[], has_image_field=True)]))
    assert db_session.query(Product).filter_by(moysklad_id="p").first().is_sale is True


def test_upsert_logs_counts(db_session):
    log = upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="a", name="A"),
        ParsedProduct(moysklad_id="b", name="B"),
    ]))
    assert log.products_created == 2
    assert log.source == "commerceml"
    assert log.finished_at is not None

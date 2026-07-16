"""Тесты upsert_catalog — запись распарсенного каталога в БД (создание + обновление)."""

import glob
import os
from decimal import Decimal

import pytest

from app.core.config import settings
from app.db.models.product import Product, Category
from app.db.models.promo import PromoCategory, MoySkladProperty
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


def _catalog(products, categories=None, property_names=None, properties=None):
    """Каталог для теста.

    ``properties`` — схема доп-полей как {Ид: имя} (то, что реально шлёт МойСклад). Если не
    задана, но заданы ``property_names``, собираем Ид автоматически — так старые тесты, которым
    важен только факт «схема пришла», остаются читаемыми.
    """
    props = dict(properties or {})
    if not props and property_names:
        props = {f"prop-{i}": n for i, n in enumerate(sorted(property_names))}
    return ParsedCatalog(categories=categories or [], products=products,
                         property_names=property_names or set(props.values()),
                         properties=props)


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


def _promo_fields(product) -> set[str]:
    """Имена доп-полей МойСклад промо-категорий, к которым привязан товар (имя — из реестра)."""
    return {c.source_field.name for c in product.promo_categories if c.source_field}


def _configure(db, field_name: str, *, slug=None, ms_id=None) -> PromoCategory:
    """Заводит промо-категорию, привязанную к доп-полю ``field_name`` — как это делает владелец
    в админке (обмен категорий не создаёт, он только пополняет реестр)."""
    prop = MoySkladProperty(id=f"reg-{field_name}", ms_property_id=ms_id, name=field_name,
                            origin="classifier" if ms_id else "backfill")
    cat = PromoCategory(id=f"cat-{field_name}", source_field_id=prop.id,
                        slug=slug or f"s-{abs(hash(field_name)) % 10000}", title=field_name,
                        is_active=True)
    db.add_all([prop, cat])
    db.commit()
    return cat


def test_upsert_does_not_autocreate_categories(db_session):
    """Обмен НЕ заводит промо-категории сам — что считать промо, решает владелец.

    Регресс на реальные прод-данные: «Минимальная единица отгрузки» имеет значение «1» у 467
    товаров. Прежняя эвристика «значение похоже на галочку» завела бы по нему промо-категорию
    на первом же обмене, причём несмываемо (реквизиты не приходят в схеме → членство по ним не
    сбрасывается никогда).
    """
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="p1", name="Т1",
                      attributes=[{"name": "Минимальная единица отгрузки", "value": "1"}]),
        ParsedProduct(moysklad_id="p2", name="Т2", attributes=[{"name": "Новинка", "value": "1"}]),
    ], property_names={"Новинка", "Минимальная единица отгрузки"}))
    assert db_session.query(PromoCategory).count() == 0
    assert _promo_fields(db_session.query(Product).filter_by(moysklad_id="p1").first()) == set()
    # ...но поля попали в реестр — владелец выберет из него нужное.
    assert {p.name for p in db_session.query(MoySkladProperty).all()} == {
        "Новинка", "Минимальная единица отгрузки"}


def test_upsert_registry_latches_id_and_follows_rename(db_session):
    """Реестр: строка без Ид «защёлкивает» его по имени, затем следует за переименованием.

    Защёлка не трогает категории — ``source_field_id`` ссылается на строку реестра, а не на Ид,
    поэтому привязка переживает и защёлку, и переименование поля в МойСклад.
    """
    cat = _configure(db_session, "Убойные цены")          # строка бэкфилла: ms_property_id = NULL
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p", name="Т",
                                attributes=[{"name": "Убойные цены", "value": "1"}])],
        properties={"ms-1": "Убойные цены"}))
    prop = db_session.query(MoySkladProperty).filter_by(name="Убойные цены").one()
    assert prop.ms_property_id == "ms-1" and prop.origin == "classifier"   # защёлка
    assert _promo_fields(db_session.query(Product).filter_by(moysklad_id="p").first()) == {"Убойные цены"}

    # Поле переименовали в МойСклад: тот же Ид, новое имя.
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p", name="Т",
                                attributes=[{"name": "Убойные цены!", "value": "1"}])],
        properties={"ms-1": "Убойные цены!"}))
    db_session.expire_all()
    assert db_session.query(MoySkladProperty).count() == 1                 # дубля не завели
    assert db_session.get(PromoCategory, cat.id).source_field.name == "Убойные цены!"
    # Связь не порвалась и товар не потерялся.
    assert _promo_fields(db_session.query(Product).filter_by(moysklad_id="p").first()) == {"Убойные цены!"}


def test_upsert_creates_promo_membership(db_session):
    """Товары привязываются к категории по выбранному владельцем доп-полю."""
    for f in ("Новинка", "Распродажа", "Убойные цены"):
        _configure(db_session, f)
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="n", name="Новинка", attributes=[{"name": "Новинка", "value": "true"}]),
        ParsedProduct(moysklad_id="s", name="Спец", attributes=[{"name": "Распродажа", "value": "да"}]),
        ParsedProduct(moysklad_id="h", name="Убой", attributes=[{"name": "Убойные цены", "value": "1"}]),
        ParsedProduct(moysklad_id="r", name="Обычный", attributes=[{"name": "Количество штук в коробке", "value": "5"}]),
        ParsedProduct(moysklad_id="off", name="Снятый", attributes=[{"name": "Новинка", "value": "false"}]),
    ]))
    g = lambda ms: db_session.query(Product).filter_by(moysklad_id=ms).first()
    assert _promo_fields(g("n")) == {"Новинка"}
    assert _promo_fields(g("s")) == {"Распродажа"}
    assert _promo_fields(g("h")) == {"Убойные цены"}
    assert _promo_fields(g("r")) == set()      # поле не выбрано владельцем → не промо
    assert _promo_fields(g("off")) == set()    # value "false" → членства нет


def test_upsert_ignores_unconfigured_category(db_session):
    """Категория без выбранного поля (source_field_id NULL) импортом не трогается.

    Так ведёт себя и «ручная» категория, и та, где владелец ещё не выбрал поле: членство
    заморожено на том, что есть, — витрина работает, товары не теряются.
    """
    cat = PromoCategory(id="manual", source_field_id=None, slug="manual", title="Хит", is_active=True)
    db_session.add(cat)
    db_session.commit()
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p", name="Т", attributes=[{"name": "Хит", "value": "1"}])],
        property_names={"Хит"}))
    assert _promo_fields(db_session.query(Product).filter_by(moysklad_id="p").first()) == set()


def test_upsert_membership_clears_on_update(db_session):
    """Снятая в МойСклад галочка снимает членство при следующем обмене со схемой доп-полей."""
    _configure(db_session, "Новинка")
    upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="p1", name="Т", attributes=[{"name": "Новинка", "value": "true"}])]))
    assert _promo_fields(db_session.query(Product).filter_by(moysklad_id="p1").first()) == {"Новинка"}
    # Следующий полный каталог: доп-поле «Новинка» всё ещё в схеме, но значения у товара нет.
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p1", name="Т",
                                attributes=[{"name": "Количество штук в коробке", "value": "5"}])],
        property_names={"Новинка", "Количество штук в коробке"}))
    db_session.expire_all()
    assert _promo_fields(db_session.query(Product).filter_by(moysklad_id="p1").first()) == set()


def test_upsert_membership_clears_when_it_was_only_attribute(db_session):
    """Регресс: снятая галочка снимает членство, даже если доп-поле было у товара единственным.

    Сигнал «пришла схема доп-полей» — ``property_names`` из классификатора, а не атрибуты товара;
    поэтому пустые атрибуты при наличии схемы всё равно снимают членство.
    """
    _configure(db_session, "Распродажа")
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p", name="Т", attributes=[{"name": "Распродажа", "value": "1"}])],
        property_names={"Распродажа"}))
    assert _promo_fields(db_session.query(Product).filter_by(moysklad_id="p").first()) == {"Распродажа"}
    # Галочку сняли → у товара НЕТ атрибутов, но схема доп-поля в обмене есть → членство снимаем.
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p", name="Т", attributes=[])],
        property_names={"Распродажа"}))
    db_session.expire_all()
    assert _promo_fields(db_session.query(Product).filter_by(moysklad_id="p").first()) == set()


def test_upsert_membership_not_cleared_without_schema(db_session):
    """«Дозаливка» без схемы доп-полей (напр. второй import.xml с картинкой) членство НЕ трогает."""
    _configure(db_session, "Распродажа")
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p", name="Т", attributes=[{"name": "Распродажа", "value": "1"}])],
        property_names={"Распродажа"}))
    assert _promo_fields(db_session.query(Product).filter_by(moysklad_id="p").first()) == {"Распродажа"}
    # Обмен без схемы (property_names пуст) — членство остаётся, чтобы не снять по ошибке.
    upsert_catalog(db_session, _catalog(
        products=[ParsedProduct(moysklad_id="p", name="Т", attributes=[], has_image_field=True)]))
    db_session.expire_all()
    assert _promo_fields(db_session.query(Product).filter_by(moysklad_id="p").first()) == {"Распродажа"}


def test_upsert_logs_counts(db_session):
    log = upsert_catalog(db_session, _catalog(products=[
        ParsedProduct(moysklad_id="a", name="A"),
        ParsedProduct(moysklad_id="b", name="B"),
    ]))
    assert log.products_created == 2
    assert log.source == "commerceml"
    assert log.finished_at is not None

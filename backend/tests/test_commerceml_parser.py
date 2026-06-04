"""Тесты парсера CommerceML — самая хрупкая часть: разбор XML от МойСклад."""

from decimal import Decimal

from app.integrations.moysklad.commerceml_parser import parse_import_xml, parse_offers_xml


def _import_xml(products="", groups=""):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация>
  <Классификатор><Группы>{groups}</Группы></Классификатор>
  <Каталог><Товары>{products}</Товары></Каталог>
</КоммерческаяИнформация>""".encode()


# ─── parse_import_xml ────────────────────────────────────────────────────────

def test_parse_import_basic():
    xml = _import_xml(
        groups="<Группа><Ид>c1</Ид><Наименование>Кремы</Наименование></Группа>",
        products=(
            "<Товар><Ид>p1</Ид><Наименование>Крем</Наименование>"
            "<Описание>Увлажняющий</Описание><Артикул>ART-1</Артикул>"
            "<Группы><Ид>c1</Ид></Группы></Товар>"
        ),
    )
    catalog = parse_import_xml(xml)

    assert len(catalog.categories) == 1
    assert catalog.categories[0].moysklad_id == "c1"
    assert catalog.categories[0].name == "Кремы"

    assert len(catalog.products) == 1
    p = catalog.products[0]
    assert p.moysklad_id == "p1"
    assert p.name == "Крем"
    assert p.description == "Увлажняющий"
    assert p.article == "ART-1"
    assert p.category_id == "c1"
    assert p.price == Decimal("0")   # цена приходит отдельно, в offers.xml


def test_parse_import_optional_fields_missing():
    """Товар без описания/артикула/группы парсится, поля = None."""
    xml = _import_xml(products="<Товар><Ид>p2</Ид><Наименование>Без полей</Наименование></Товар>")
    catalog = parse_import_xml(xml)
    p = catalog.products[0]
    assert p.description is None
    assert p.article is None
    assert p.category_id is None


def test_parse_import_skips_product_without_id_or_name():
    """Товар без Ид или Наименования игнорируется (а не падает)."""
    xml = _import_xml(products=(
        "<Товар><Наименование>Нет Ид</Наименование></Товар>"
        "<Товар><Ид>p3</Ид></Товар>"
        "<Товар><Ид>p4</Ид><Наименование>Норм</Наименование></Товар>"
    ))
    catalog = parse_import_xml(xml)
    assert [p.moysklad_id for p in catalog.products] == ["p4"]


def test_parse_import_with_namespace():
    """МойСклад обычно без namespace, но парсер должен понимать и стандартный CommerceML."""
    xml = """<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация xmlns="urn:1C.ru:commerceml_2">
  <Каталог><Товары>
    <Товар><Ид>p5</Ид><Наименование>С неймспейсом</Наименование></Товар>
  </Товары></Каталог>
</КоммерческаяИнформация>""".encode()
    catalog = parse_import_xml(xml)
    assert len(catalog.products) == 1
    assert catalog.products[0].name == "С неймспейсом"


# ─── parse_offers_xml ────────────────────────────────────────────────────────

def _offers_xml(offers):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация><ПакетПредложений><Предложения>{offers}</Предложения></ПакетПредложений></КоммерческаяИнформация>""".encode()


def test_parse_offers_applies_price_and_stock():
    catalog = parse_import_xml(_import_xml(
        products="<Товар><Ид>p1</Ид><Наименование>Крем</Наименование></Товар>"
    ))
    parse_offers_xml(_offers_xml(
        "<Предложение><Ид>p1</Ид>"
        "<Цены><Цена><ЦенаЗаЕдиницу>1499.50</ЦенаЗаЕдиницу></Цена></Цены>"
        "<Количество>7</Количество></Предложение>"
    ), catalog)
    p = catalog.products[0]
    assert p.price == Decimal("1499.50")   # рубли, без деления на 100
    assert p.stock == 7


def test_parse_offers_variant_id_suffix():
    """Id предложения вида 'uuid#размер' должен матчиться по базовому uuid."""
    catalog = parse_import_xml(_import_xml(
        products="<Товар><Ид>base-id</Ид><Наименование>Т</Наименование></Товар>"
    ))
    parse_offers_xml(_offers_xml(
        "<Предложение><Ид>base-id#L</Ид>"
        "<Цены><Цена><ЦенаЗаЕдиницу>100</ЦенаЗаЕдиницу></Цена></Цены>"
        "<Количество>3</Количество></Предложение>"
    ), catalog)
    assert catalog.products[0].price == Decimal("100")
    assert catalog.products[0].stock == 3


def test_parse_offers_comma_decimal():
    """Цена с запятой как разделителем (1499,90) должна разобраться."""
    catalog = parse_import_xml(_import_xml(
        products="<Товар><Ид>p1</Ид><Наименование>Т</Наименование></Товар>"
    ))
    parse_offers_xml(_offers_xml(
        "<Предложение><Ид>p1</Ид>"
        "<Цены><Цена><ЦенаЗаЕдиницу>1499,90</ЦенаЗаЕдиницу></Цена></Цены>"
        "<Количество>1</Количество></Предложение>"
    ), catalog)
    assert catalog.products[0].price == Decimal("1499.90")


def test_parse_offers_ignores_unknown_product():
    """Предложение для товара, которого нет в каталоге, просто игнорируется."""
    catalog = parse_import_xml(_import_xml(
        products="<Товар><Ид>known</Ид><Наименование>Т</Наименование></Товар>"
    ))
    parse_offers_xml(_offers_xml(
        "<Предложение><Ид>unknown</Ид><Количество>9</Количество></Предложение>"
    ), catalog)
    assert catalog.products[0].stock == 0   # не тронут

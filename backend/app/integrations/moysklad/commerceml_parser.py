"""
CommerceML 2.x парсер для импорта данных из МойСклад.

Структура XML которую мы ожидаем:

import.xml:
  <КоммерческаяИнформация>
    <Классификатор>
      <Группы>
        <Группа>
          <Ид>...</Ид>
          <Наименование>...</Наименование>
        </Группа>
      </Группы>
    </Классификатор>
    <Каталог>
      <Товары>
        <Товар>
          <Ид>uuid</Ид>
          <Наименование>Название</Наименование>
          <Описание>...</Описание>
          <Артикул>...</Артикул>
          <Группы><Ид>...</Ид></Группы>
        </Товар>
      </Товары>
    </Каталог>
  </КоммерческаяИнформация>

offers.xml:
  <КоммерческаяИнформация>
    <ПакетПредложений>
      <Предложения>
        <Предложение>
          <Ид>uuid</Ид>
          <Цены><Цена><ЦенаЗаЕдиницу>12.50</ЦенаЗаЕдиницу></Цена></Цены>
          <Количество>5</Количество>
        </Предложение>
      </Предложения>
    </ПакетПредложений>
  </КоммерческаяИнформация>
"""

from dataclasses import dataclass, field
from decimal import Decimal
from lxml import etree


@dataclass
class ParsedCategory:
    moysklad_id: str
    name: str
    parent_id: str | None = None


@dataclass
class ParsedProduct:
    moysklad_id: str
    name: str
    description: str | None = None
    article: str | None = None
    code: str | None = None
    category_id: str | None = None
    price: Decimal = Decimal("0")
    stock: int = 0


@dataclass
class ParsedCatalog:
    categories: list[ParsedCategory] = field(default_factory=list)
    products: list[ParsedProduct] = field(default_factory=list)


# Пространство имён CommerceML — МойСклад использует его в XML
_NS = "urn:1C.ru:commerceml_2"


def _tag(name: str) -> str:
    """Возвращает тег с пространством имён: {urn:...}Наименование"""
    return f"{{{_NS}}}{name}"


def _text(element, tag: str, default: str | None = None) -> str | None:
    """Достаёт текст из дочернего элемента по имени тега."""
    child = element.find(_tag(tag))
    if child is not None and child.text:
        return child.text.strip()
    return default


def parse_import_xml(xml_bytes: bytes) -> ParsedCatalog:
    """
    Парсит import.xml — категории и товары.
    Возвращает ParsedCatalog с заполненными списками.
    """
    root = etree.fromstring(xml_bytes)
    catalog = ParsedCatalog()

    # ─── Категории ────────────────────────────────────────────────────────────
    classifier = root.find(_tag("Классификатор"))
    if classifier is not None:
        groups_el = classifier.find(_tag("Группы"))
        if groups_el is not None:
            catalog.categories = _parse_groups(groups_el, parent_id=None)

    # ─── Товары ───────────────────────────────────────────────────────────────
    catalog_el = root.find(_tag("Каталог"))
    if catalog_el is not None:
        products_el = catalog_el.find(_tag("Товары"))
        if products_el is not None:
            for товар in products_el.findall(_tag("Товар")):
                product = _parse_product(товар)
                if product:
                    catalog.products.append(product)

    return catalog


def parse_offers_xml(xml_bytes: bytes, catalog: ParsedCatalog) -> None:
    """
    Парсит offers.xml — цены и остатки.
    Обновляет price и stock прямо в объектах ParsedProduct из catalog.
    """
    root = etree.fromstring(xml_bytes)

    # Строим индекс товаров по moysklad_id для быстрого поиска
    product_index = {p.moysklad_id: p for p in catalog.products}

    packet = root.find(_tag("ПакетПредложений"))
    if packet is None:
        return

    offers_el = packet.find(_tag("Предложения"))
    if offers_el is None:
        return

    for предложение in offers_el.findall(_tag("Предложение")):
        offer_id = _text(предложение, "Ид")
        if not offer_id:
            continue

        # Убираем суффикс варианта если есть: "uuid#variant" → "uuid"
        base_id = offer_id.split("#")[0]
        product = product_index.get(base_id)
        if not product:
            continue

        # Цена
        prices_el = предложение.find(_tag("Цены"))
        if prices_el is not None:
            price_el = prices_el.find(_tag("Цена"))
            if price_el is not None:
                price_str = _text(price_el, "ЦенаЗаЕдиницу", "0")
                try:
                    product.price = Decimal(price_str.replace(",", "."))
                except Exception:
                    pass

        # Остатки
        qty_str = _text(предложение, "Количество", "0")
        try:
            product.stock = int(float(qty_str))
        except Exception:
            pass


def _parse_groups(groups_el, parent_id: str | None) -> list[ParsedCategory]:
    """Рекурсивно парсит дерево категорий."""
    result = []
    for group in groups_el.findall(_tag("Группа")):
        group_id = _text(group, "Ид")
        name = _text(group, "Наименование")
        if not group_id or not name:
            continue
        result.append(ParsedCategory(moysklad_id=group_id, name=name, parent_id=parent_id))
        # Вложенные подгруппы
        nested = group.find(_tag("Группы"))
        if nested is not None:
            result.extend(_parse_groups(nested, parent_id=group_id))
    return result


def _parse_product(товар) -> ParsedProduct | None:
    """Парсит один элемент <Товар>."""
    product_id = _text(товар, "Ид")
    name = _text(товар, "Наименование")
    if not product_id or not name:
        return None

    # Категория — первый элемент <Ид> внутри <Группы>
    category_id = None
    groups_el = товар.find(_tag("Группы"))
    if groups_el is not None:
        first_id = groups_el.find(_tag("Ид"))
        if first_id is not None and first_id.text:
            category_id = first_id.text.strip()

    return ParsedProduct(
        moysklad_id=product_id,
        name=name,
        description=_text(товар, "Описание"),
        article=_text(товар, "Артикул"),
        code=_text(товар, "БазоваяЕдиница"),
        category_id=category_id,
    )

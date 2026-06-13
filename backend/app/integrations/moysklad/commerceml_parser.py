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
    image_url: str | None = None          # первая картинка (для списка/карточки/OG)
    images: list[str] = field(default_factory=list)   # все картинки товара
    price: Decimal = Decimal("0")
    stock: int = 0
    # Были ли для товара данные в offers.xml этого захода обмена. МойСклад может
    # прислать import.xml без offers.xml (например, второй заход — только с картинкой);
    # тогда цену/остаток перезаписывать нельзя, иначе они обнулятся.
    has_offer: bool = False


@dataclass
class ParsedCatalog:
    categories: list[ParsedCategory] = field(default_factory=list)
    products: list[ParsedProduct] = field(default_factory=list)


# Пространство имён CommerceML (опционально — МойСклад может не включать его)
_NS = "urn:1C.ru:commerceml_2"


def _tag(name: str, ns: str = "") -> str:
    """Возвращает тег с namespace или без него."""
    return f"{{{ns}}}{name}" if ns else name


def _text(element, tag: str, default: str | None = None, ns: str = "") -> str | None:
    """Достаёт текст из дочернего элемента. Пробует с namespace и без."""
    child = element.find(_tag(tag, ns))
    if child is None and ns:
        child = element.find(tag)  # fallback без namespace
    if child is not None and child.text:
        return child.text.strip()
    return default


def _texts(element, tag: str, ns: str = "") -> list[str]:
    """Достаёт текст ВСЕХ дочерних элементов с тегом (пробует с namespace и без)."""
    els = element.findall(_tag(tag, ns))
    if not els and ns:
        els = element.findall(tag)  # fallback без namespace
    return [e.text.strip() for e in els if e.text and e.text.strip()]


def _detect_ns(root) -> str:
    """Определяет namespace из корневого элемента (или возвращает пустую строку)."""
    tag = root.tag
    if tag.startswith("{"):
        return tag[1:tag.index("}")]
    return ""


def parse_import_xml(xml_bytes: bytes) -> ParsedCatalog:
    """Парсит ``import.xml`` — категории и товары.

    Namespace определяется автоматически (МойСклад обычно шлёт XML без ``xmlns``).
    Цены и остатки на этом шаге ещё нулевые — они приходят отдельно в ``offers.xml``.

    Args:
        xml_bytes: Сырые байты ``import.xml``.

    Returns:
        :class:`ParsedCatalog` с заполненными списками категорий и товаров.
    """
    root = etree.fromstring(xml_bytes)
    ns = _detect_ns(root)
    catalog = ParsedCatalog()

    # ─── Категории ────────────────────────────────────────────────────────────
    classifier = root.find(_tag("Классификатор", ns))
    if classifier is not None:
        groups_el = classifier.find(_tag("Группы", ns))
        if groups_el is not None:
            catalog.categories = _parse_groups(groups_el, parent_id=None, ns=ns)

    # ─── Товары ───────────────────────────────────────────────────────────────
    catalog_el = root.find(_tag("Каталог", ns))
    if catalog_el is not None:
        products_el = catalog_el.find(_tag("Товары", ns))
        if products_el is not None:
            for товар in products_el.findall(_tag("Товар", ns)):
                product = _parse_product(товар, ns=ns)
                if product:
                    catalog.products.append(product)

    return catalog


def parse_offers_xml(xml_bytes: bytes, catalog: ParsedCatalog) -> None:
    """Парсит ``offers.xml`` — цены и остатки — и дописывает их в каталог.

    Обновляет ``price`` и ``stock`` прямо в объектах :class:`ParsedProduct` внутри
    ``catalog`` (находит их по ``moysklad_id``). Цена берётся как есть, в рублях —
    без деления на 100. Предложения для товаров не из каталога игнорируются.

    Args:
        xml_bytes: Сырые байты ``offers.xml``.
        catalog: Каталог из :func:`parse_import_xml`, который дополняется на месте.

    Returns:
        None. Результат — мутация переданного ``catalog``.
    """
    root = etree.fromstring(xml_bytes)
    ns = _detect_ns(root)

    product_index = {p.moysklad_id: p for p in catalog.products}

    packet = root.find(_tag("ПакетПредложений", ns))
    if packet is None:
        return

    offers_el = packet.find(_tag("Предложения", ns))
    if offers_el is None:
        return

    for предложение in offers_el.findall(_tag("Предложение", ns)):
        offer_id = _text(предложение, "Ид", ns=ns)
        if not offer_id:
            continue

        base_id = offer_id.split("#")[0]
        product = product_index.get(base_id)
        if not product:
            continue
        product.has_offer = True  # для товара пришли цена/остаток в этом заходе обмена

        prices_el = предложение.find(_tag("Цены", ns))
        if prices_el is not None:
            price_el = prices_el.find(_tag("Цена", ns))
            if price_el is not None:
                price_str = _text(price_el, "ЦенаЗаЕдиницу", "0", ns=ns)
                try:
                    product.price = Decimal(price_str.replace(",", "."))
                except Exception:
                    pass

        qty_str = _text(предложение, "Количество", "0", ns=ns)
        try:
            product.stock = int(float(qty_str))
        except Exception:
            pass


def _parse_groups(groups_el, parent_id: str | None, ns: str = "") -> list[ParsedCategory]:
    """Рекурсивно парсит дерево категорий."""
    result = []
    for group in groups_el.findall(_tag("Группа", ns)):
        group_id = _text(group, "Ид", ns=ns)
        name = _text(group, "Наименование", ns=ns)
        if not group_id or not name:
            continue
        result.append(ParsedCategory(moysklad_id=group_id, name=name, parent_id=parent_id))
        nested = group.find(_tag("Группы", ns))
        if nested is not None:
            result.extend(_parse_groups(nested, parent_id=group_id, ns=ns))
    return result


def _requisites(товар, ns: str = "") -> dict[str, str]:
    """Собирает <ЗначениеРеквизита> товара в словарь {Наименование: Значение}.

    МойСклад часто кладёт описание/артикул не в свои теги, а в реквизиты —
    например ``<ЗначениеРеквизита><Наименование>Описание</Наименование>…``.
    """
    out: dict[str, str] = {}
    # Реквизиты обычно вложены в <ЗначенияРеквизитов> — ищем на любой глубине (.//)
    reqs = товар.findall(f".//{_tag('ЗначениеРеквизита', ns)}")
    if not reqs and ns:
        reqs = товар.findall(".//ЗначениеРеквизита")
    for req in reqs:
        name = _text(req, "Наименование", ns=ns)
        value = _text(req, "Значение", ns=ns)
        if name and value:
            out[name] = value
    return out


def _parse_product(товар, ns: str = "") -> ParsedProduct | None:
    """Парсит один элемент <Товар>."""
    product_id = _text(товар, "Ид", ns=ns)
    name = _text(товар, "Наименование", ns=ns)
    if not product_id or not name:
        return None

    # Описание/артикул могут приходить как реквизиты, а не отдельными тегами — берём фолбэком
    reqs = _requisites(товар, ns=ns)
    description = (_text(товар, "Описание", ns=ns)
                  or reqs.get("Описание") or reqs.get("ОписаниеВФорматеHTML")
                  or reqs.get("Полное наименование"))
    article = _text(товар, "Артикул", ns=ns) or reqs.get("Артикул")

    category_id = None
    groups_el = товар.find(_tag("Группы", ns))
    if groups_el is not None:
        first_id = groups_el.find(_tag("Ид", ns))
        if first_id is not None and first_id.text:
            category_id = first_id.text.strip()

    # Все картинки товара (CommerceML может прислать несколько <Картинка>).
    # Файлы картинок приходят отдельными POST'ами обмена; здесь — их имена/пути.
    images = _texts(товар, "Картинка", ns=ns)

    return ParsedProduct(
        moysklad_id=product_id,
        name=name,
        description=description,
        article=article,
        code=_text(товар, "БазоваяЕдиница", ns=ns),
        category_id=category_id,
        image_url=images[0] if images else None,
        images=images,
    )

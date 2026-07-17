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
from io import BytesIO

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
    # Характеристики товара (реквизиты МойСклад, кроме технических/уже используемых):
    # список {"name", "value"} — показываются отдельным блоком в карточке.
    attributes: list[dict] = field(default_factory=list)
    price: Decimal = Decimal("0")
    stock: int = 0
    # Были ли для товара данные в offers.xml этого захода обмена. МойСклад может
    # прислать import.xml без offers.xml (например, второй заход — только с картинкой);
    # тогда цену/остаток перезаписывать нельзя, иначе они обнулятся.
    has_offer: bool = False
    # Присутствовал ли у товара тег <Картинка> в import.xml этого захода (даже пустой).
    # Нужно, чтобы отличать «фото удалили» (пустой тег → чистим images) от «в этом заходе
    # тега фото не было вовсе» (обычный import.xml без картинок → images НЕ трогаем).
    has_image_field: bool = False


@dataclass
class ParsedCatalog:
    categories: list[ParsedCategory] = field(default_factory=list)
    products: list[ParsedProduct] = field(default_factory=list)
    # Имена доп-полей (свойств классификатора) из <Классификатор><Свойства> ЭТОГО обмена.
    # Пусто у «дозаливки» без схемы (второй import.xml с картинкой). Нужно, чтобы понять,
    # что обмен принёс схему доп-полей и флаги («Распродажа»/«Новинка»/«Убойные») можно
    # ПЕРЕСЧИТАТЬ — в т.ч. СБРОСИТЬ снятые в МойСклад (у товара значение свойства исчезает).
    property_names: set[str] = field(default_factory=set)
    # Свойства классификатора этого обмена как {Ид: имя}. Ид — стабильный ключ поля: он
    # переживает переименование в МойСклад, тогда как имя — нет. Наполняет реестр доп-полей
    # (services/property_registry), по которому админ выбирает поле для промо-категории.
    # property_names выше — это ровно set(properties.values()), оставлен для существующих мест.
    properties: dict[str, str] = field(default_factory=dict)
    # Атрибут <Каталог СодержитТолькоИзменения="true|false">. На этом аккаунте МойСклад:
    #  • ПОЛНЫЙ каталог (false) — весь ассортимент, но БЕЗ единой <Картинка> (проверено на проде:
    #    12542 товара, 0 картинок). Отсутствие тега тут НЕ значит «фото удалили» — фото в полном
    #    каталоге не выгружаются вовсе, поэтому фото по нему НЕ трогаем.
    #  • Дельта-выгрузка (true) — только изменённые товары, ПОЛНОЙ карточкой (с <Картинка>, если
    #    фото есть). Именно здесь удаление фото видно как «был тег → пропал», и только здесь его ловим.
    changes_only: bool = False


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

    Разбор **потоковый** (``iterparse``): каждый <Товар> разбирается на своём ``end``-событии
    и тут же выбрасывается из дерева вместе с уже обработанными соседями. Полный DOM каталога
    в памяти не строится — на 12.5к товаров это экономит ~100 МБ и, что важнее, убирает цикл
    «выделили 100 МБ → освободили» на каждом обмене (раз в 30 минут), от которого куча
    фрагментировалась и RSS воркера полз вверх.

    Args:
        xml_bytes: Сырые байты ``import.xml``.

    Returns:
        :class:`ParsedCatalog` с заполненными списками категорий и товаров.

    Raises:
        ValueError: Если <Классификатор> пришёл ПОСЛЕ товаров. Потоковый разбор видит документ
            по порядку, поэтому такая перестановка молча дала бы товары без характеристик
            (и порвала бы членство в промо-категориях). Лучше явная ошибка обмена, чем тихая
            порча данных. Реальный МойСклад всегда шлёт классификатор первым.
    """
    catalog = ParsedCatalog()
    prop_map: dict[str, str] = {}
    ns = ""
    tags: dict[str, str] = {}
    catalog_seen = False        # первый <Каталог> — как root.find() брал именно первый
    classifier_done = False

    # Только end-события и только для нужных тегов. Без фильтра lxml дёргал бы Python на каждом
    # из ~200к узлов файла, и разбор выходил дороже DOM'а. start не нужен: внутри разбора
    # changes_only не используется (его читает уже потребитель готового ParsedCatalog), а
    # принадлежность товара каталогу видна по цепочке родителей.
    # "{*}X" ловит тег и с namespace, и без — МойСклад шлёт без, но это не гарантия.
    for _event, elem in etree.iterparse(
        BytesIO(xml_bytes),
        events=("end",),
        tag=("{*}Классификатор", "{*}Каталог", "{*}Товар"),
    ):
        if not tags:
            # Namespace берём с первого же подошедшего элемента: он тот же, что у корня
            # (раньше — _detect_ns(root)), а корень при фильтре по тегам событий не даёт.
            ns = _detect_ns(elem)
            tags = {n: _tag(n, ns) for n in
                    ("Классификатор", "Группы", "Каталог", "Товары", "Товар")}

        # ─── Категории и свойства классификатора ─────────────────────────────
        if elem.tag == tags["Классификатор"] and not classifier_done:
            if catalog.products:
                raise ValueError(
                    "<Классификатор> пришёл после <Товары> — характеристики товаров были бы "
                    "потеряны при потоковом разборе"
                )
            classifier_done = True
            groups_el = elem.find(tags["Группы"])
            if groups_el is not None:
                catalog.categories = _parse_groups(groups_el, parent_id=None, ns=ns)
            # Карта свойств классификатора (Ид → название) для характеристик товара
            prop_map = _parse_properties(elem, ns=ns)
            # Имена доп-полей этого обмена — сигнал «пришла схема свойств» (см. ParsedCatalog).
            catalog.properties = dict(prop_map)
            catalog.property_names = set(prop_map.values())
            elem.clear()

        # ─── Товары ──────────────────────────────────────────────────────────
        elif elem.tag == tags["Товар"]:
            # Только прямые дети <Товары> первого <Каталог> — как раньше
            # root.find("Каталог").find("Товары").findall("Товар").
            parent = elem.getparent()
            if (parent is not None and parent.tag == tags["Товары"]
                    and (gp := parent.getparent()) is not None and gp.tag == tags["Каталог"]):
                product = _parse_product(elem, ns=ns, prop_map=prop_map)
                if product:
                    catalog.products.append(product)
                # Освобождаем разобранный товар И уже обработанных соседей: одного clear()
                # мало — родитель продолжает держать опустевшие элементы, и дерево всё равно
                # растёт на весь файл.
                elem.clear()
                while elem.getprevious() is not None:
                    del parent[0]

        elif elem.tag == tags["Каталог"] and not catalog_seen:
            # <Каталог СодержитТолькоИзменения="true"> — дельта-выгрузка (только изменённые
            # товары), именно в ней приходит удаление фото. У полного каталога "false"/нет
            # атрибута. end у <Каталог> приходит после его товаров — разбору это не мешает.
            catalog_seen = True
            catalog.changes_only = (
                (elem.get("СодержитТолькоИзменения") or "").strip().lower() == "true"
            )

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


# Реквизиты, которые НЕ показываем как характеристики: технические или уже выведенные
# отдельными полями (описание/артикул/код и служебные поля МойСклад).
_NON_ATTR_REQS = {
    "Описание", "ОписаниеВФорматеHTML", "Полное наименование", "Полное наименование товара",
    "Артикул", "Код", "ВидНоменклатуры", "ТипНоменклатуры", "БазоваяЕдиница",
    "НоменклатурнаяГруппа", "Группа", "Ставка НДС",
}


def _parse_properties(classifier, ns: str = "") -> dict[str, str]:
    """{Ид свойства: Наименование} из <Классификатор><Свойства>.

    МойСклад кладёт характеристики товара в свойства классификатора, а у товара —
    только их значения (<ЗначенияСвойств>), ссылаясь на свойство по Ид. Эта карта
    нужна, чтобы превратить значение обратно в пару «название: значение».
    """
    out: dict[str, str] = {}
    if classifier is None:
        return out
    props_el = classifier.find(_tag("Свойства", ns))
    if props_el is None and ns:
        props_el = classifier.find("Свойства")
    if props_el is None:
        return out
    for prop in list(props_el):
        if not prop.tag.endswith("Свойство"):
            continue
        pid = _text(prop, "Ид", ns=ns)
        name = _text(prop, "Наименование", ns=ns)
        if pid and name:
            out[pid] = name
    return out


def _property_values(товар, prop_map: dict[str, str], ns: str = "") -> list[dict]:
    """Характеристики товара из <ЗначенияСвойств> → [{"name", "value"}].

    Имя свойства берём из ``prop_map`` по Ид. Контейнер у МойСклад — <ЗначенияСвойств>,
    элемент — <ЗначенияСвойства> (нестандартно), поддерживаем и стандартное <ЗначениеСвойства>.
    """
    if not prop_map:
        return []
    container = товар.find(_tag("ЗначенияСвойств", ns))
    if container is None and ns:
        container = товар.find("ЗначенияСвойств")
    if container is None:
        return []
    out: list[dict] = []
    for item in list(container):
        if not (item.tag.endswith("ЗначениеСвойства") or item.tag.endswith("ЗначенияСвойства")):
            continue
        pid = _text(item, "Ид", ns=ns)
        value = _text(item, "Значение", ns=ns)
        name = prop_map.get(pid) if pid else None
        if not name or not value:
            continue
        # Юридические/сертификатные свойства покупателю не нужны — пропускаем.
        low = name.lower()
        if any(k in low for k in ("сертификат", "деклар", "выдавш", "госуд.регистр")):
            continue
        out.append({"name": name, "value": value})
    return out


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


def _parse_product(товар, ns: str = "", prop_map: dict[str, str] | None = None) -> ParsedProduct | None:
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

    # Характеристики = свойства классификатора (<ЗначенияСвойств>) + реквизиты, кроме
    # технических и тех, что уже показаны отдельно. Свойства идут первыми — это и есть
    # «характеристики/модификации» из МойСклад; реквизиты — фолбэк.
    attributes = _property_values(товар, prop_map or {}, ns=ns)
    attributes += [
        {"name": k, "value": v}
        for k, v in reqs.items()
        if k not in _NON_ATTR_REQS
    ]

    category_id = None
    groups_el = товар.find(_tag("Группы", ns))
    if groups_el is not None:
        first_id = groups_el.find(_tag("Ид", ns))
        if first_id is not None and first_id.text:
            category_id = first_id.text.strip()

    # Все картинки товара (CommerceML может прислать несколько <Картинка>).
    # Файлы картинок приходят отдельными POST'ами обмена; здесь — их имена/пути.
    # Отдельно фиксируем сам факт наличия тега <Картинка> (в т.ч. пустого): пустой тег
    # означает «фото удалили в МойСклад», а отсутствие тега — «в этом заходе фото не слали».
    img_els = товар.findall(_tag("Картинка", ns))
    if not img_els and ns:
        img_els = товар.findall("Картинка")  # fallback без namespace
    has_image_field = len(img_els) > 0
    images = [e.text.strip() for e in img_els if e.text and e.text.strip()]

    return ParsedProduct(
        moysklad_id=product_id,
        name=name,
        description=description,
        article=article,
        code=_text(товар, "БазоваяЕдиница", ns=ns),
        category_id=category_id,
        image_url=images[0] if images else None,
        images=images,
        attributes=attributes,
        has_image_field=has_image_field,
    )

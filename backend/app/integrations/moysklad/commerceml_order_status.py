"""Разбор orders.xml от МойСклад — статусы заказов, приходящие обратно.

При опции «Выгружать изменения по заказам» МойСклад загружает нам ``orders.xml`` с
текущим состоянием заказов. Нужны номер заказа (``<Документ><Номер>`` = наш ``Order.number``)
и реквизит «Статус заказа» из ``ЗначенияРеквизитов`` уровня документа. CommerceML от
МойСклад идёт без ``xmlns`` (см. commerceml_parser), поэтому теги ищем по локальному имени.
"""

from lxml import etree


def _local(tag) -> str:
    """Имя тега без namespace (МойСклад шлёт без xmlns, но на всякий случай)."""
    return str(tag).rsplit("}", 1)[-1]


def _child(el, name):
    for c in el:
        if _local(c.tag) == name:
            return c
    return None


def _doc_requisites(doc) -> dict:
    """Реквизиты УРОВНЯ ДОКУМЕНТА (Документ/ЗначенияРеквизитов) → {Наименование: Значение}.

    Внутри ``Товар`` тоже есть ЗначенияРеквизитов — они лежат глубже (не прямые дети
    Документа), поэтому не попадают сюда.
    """
    out: dict[str, str] = {}
    for zn in doc:
        if _local(zn.tag) != "ЗначенияРеквизитов":
            continue
        for req in zn:
            if _local(req.tag) != "ЗначениеРеквизита":
                continue
            name = _child(req, "Наименование")
            val = _child(req, "Значение")
            if name is not None and name.text:
                out[name.text.strip()] = (val.text or "").strip() if val is not None else ""
    return out


def _text(el) -> str:
    """Текст элемента (или пусто), обрезанный."""
    return (el.text or "").strip() if el is not None and el.text is not None else ""


def _parse_items(doc) -> list[dict] | None:
    """Позиции заказа из ``<Товары><Товар>…``.

    Возвращает список ``{ms_id, article, name, price, quantity}`` (строки — приведёт
    вызывающий) или ``None``, если секции ``<Товары>`` нет (тогда состав не трогаем).
    """
    tovary = _child(doc, "Товары")
    if tovary is None:
        return None
    items: list[dict] = []
    for tov in tovary:
        if _local(tov.tag) != "Товар":
            continue
        name = _text(_child(tov, "Наименование"))
        if not name:
            continue
        items.append({
            "ms_id": _text(_child(tov, "Ид")),
            "article": _text(_child(tov, "Артикул")),
            "name": name,
            "price": _text(_child(tov, "ЦенаЗаЕдиницу")),
            "quantity": _text(_child(tov, "Количество")),
        })
    return items


def parse_order_statuses(xml: bytes) -> list[dict]:
    """Разбирает orders.xml → список словарей по документам.

    Каждый: ``{number, status, ms_number, deleted, total, items}``. ``total`` — итоговая
    сумма документа (``<Сумма>`` — прямой ребёнок ``<Документ>``, не внутри Товара/Скидки);
    ``items`` — позиции (см. ``_parse_items``) или ``None``, если товаров в документе нет.
    """
    try:
        root = etree.fromstring(xml)
    except Exception:
        return []
    result: list[dict] = []
    for doc in root:
        if _local(doc.tag) != "Документ":
            continue
        num_el = _child(doc, "Номер")
        number = (num_el.text or "").strip() if num_el is not None and num_el.text else ""
        if not number:
            continue
        reqs = _doc_requisites(doc)
        result.append({
            "number": number,
            "status": reqs.get("Статус заказа") or None,
            "ms_number": reqs.get("Номер по 1С") or None,
            "deleted": reqs.get("ПометкаУдаления", "").lower() == "true",
            # _child(doc, "Сумма") — первый прямой ребёнок Документа (общий итог); суммы
            # внутри Товар/Скидки вложены глубже и сюда не попадают.
            "total": _text(_child(doc, "Сумма")) or None,
            "items": _parse_items(doc),
        })
    return result

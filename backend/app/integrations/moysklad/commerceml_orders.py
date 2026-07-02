"""Сериализация заказов в CommerceML-XML для выгрузки в МойСклад.

При включённой загрузке заказов МойСклад сам забирает их у магазина
(``GET ?type=sale&mode=query``) и ожидает документ CommerceML 2 с заказами. Товары
сопоставляются по ``<Ид>``, равному id товара из выгрузки каталога (наш
``Product.moysklad_id``). Контрагент создаётся/находится МойСклад по этим данным;
резерв вешается самим МойСклад (настройка «Резервировать товары»).
"""

from datetime import datetime

from lxml import etree

SCHEMA_VERSION = "2.04"

# Способ получения заказа → человекочитаемая метка для МойСклад.
DELIVERY_LABELS = {
    "pickup": "Самовывоз",
    "shop_transport": "Доставка транспортом ТД «Инженер»",
    "tk": "Доставка транспортной компанией",
}


def _sub(parent, tag: str, text=None):
    """Добавляет дочерний элемент с текстом (текст экранируется lxml автоматически)."""
    el = etree.SubElement(parent, tag)
    if text is not None:
        el.text = str(text)
    return el


def build_orders_xml(orders, ms_id_by_product: dict[str, str], guest_ext_code: str | None = None) -> bytes:
    """Строит CommerceML-XML с заказами для выгрузки в МойСклад.

    Args:
        orders: Список ORM-заказов (:class:`Order`) с подгруженными ``items``.
        ms_id_by_product: отображение ``product_id`` (наш internal) → ``moysklad_id``
            (id товара из каталога обмена) для сопоставления позиций.
        guest_ext_code: «Внешний код» единого контрагента для гостевых заказов (без
            регистрации). Если задан — все гости привязываются к нему, а не плодят новых.

    Returns:
        Байты XML (UTF-8, с XML-декларацией).
    """
    root = etree.Element("КоммерческаяИнформация")
    root.set("ВерсияСхемы", SCHEMA_VERSION)
    root.set("ДатаФормирования", datetime.now().strftime("%Y-%m-%dT%H:%M:%S"))

    for order in orders:
        doc = _sub(root, "Документ")
        _sub(doc, "Ид", order.number)
        _sub(doc, "Номер", order.number)
        created = order.created_at or datetime.now()
        _sub(doc, "Дата", created.strftime("%Y-%m-%d"))
        _sub(doc, "Время", created.strftime("%H:%M:%S"))
        _sub(doc, "ХозОперация", "Заказ товара")
        _sub(doc, "Роль", "Продавец")
        _sub(doc, "Валюта", "руб")
        _sub(doc, "Курс", "1")
        _sub(doc, "Сумма", f"{order.total_amount:.2f}")

        # ─── Контрагент (покупатель) ───
        cps = _sub(doc, "Контрагенты")
        cp = _sub(cps, "Контрагент")
        # <Ид> контрагента → попадает во «Внешний код» в МойСклад (ключ сопоставления).
        # Приоритет: код пользователя (стабильный/привязка к существующему контрагенту);
        # иначе телефон (гость или аккаунт без кода) — прежнее поведение.
        ext_code = None
        try:
            if order.user is not None and order.user.moysklad_ext_code:
                ext_code = order.user.moysklad_ext_code
        except Exception:
            ext_code = None
        # Гостевой заказ (без пользователя): единый контрагент «Заказы с сайта», если задан,
        # чтобы не плодить нового контрагента на каждый заказ гостя.
        if not ext_code and guest_ext_code:
            ext_code = guest_ext_code
        _sub(cp, "Ид", ext_code or order.customer_phone)
        _sub(cp, "Наименование", order.customer_name)
        _sub(cp, "ПолноеНаименование", order.customer_name)
        if order.customer_inn:                          # ИП/ООО — ИНН для контрагента
            _sub(cp, "ИНН", order.customer_inn)
        _sub(cp, "Роль", "Покупатель")
        contacts = _sub(cp, "Контакты")
        phone_c = _sub(contacts, "Контакт")
        _sub(phone_c, "Тип", "Телефон")
        _sub(phone_c, "Значение", order.customer_phone)
        if order.customer_email:
            mail_c = _sub(contacts, "Контакт")
            _sub(mail_c, "Тип", "Почта")
            _sub(mail_c, "Значение", order.customer_email)

        # ─── Товары ───
        goods = _sub(doc, "Товары")
        for item in order.items:
            ms_id = ms_id_by_product.get(item.product_id)
            if not ms_id:
                continue   # товар не сопоставить с каталогом МойСклад — пропускаем
            t = _sub(goods, "Товар")
            _sub(t, "Ид", ms_id)
            _sub(t, "Наименование", item.product_name)
            _sub(t, "ЦенаЗаЕдиницу", f"{item.price:.2f}")
            _sub(t, "Количество", item.quantity)
            _sub(t, "Сумма", f"{item.price * item.quantity:.2f}")

        # ─── Доп. реквизиты: способ получения, адрес доставки, комментарий ───
        reqs = _sub(doc, "ЗначенияРеквизитов")
        if order.delivery_method:
            r = _sub(reqs, "ЗначениеРеквизита")
            _sub(r, "Наименование", "Способ получения")
            _sub(r, "Значение", DELIVERY_LABELS.get(order.delivery_method, order.delivery_method))
        if order.delivery_address:
            r = _sub(reqs, "ЗначениеРеквизита")
            _sub(r, "Наименование", "Адрес доставки")
            _sub(r, "Значение", order.delivery_address)
        if order.comment:
            r = _sub(reqs, "ЗначениеРеквизита")
            _sub(r, "Наименование", "Комментарий")
            _sub(r, "Значение", order.comment)

    return etree.tostring(root, encoding="UTF-8", xml_declaration=True, pretty_print=True)

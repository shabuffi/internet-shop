"""Сериализация заказов в CommerceML-XML для выгрузки в МойСклад.

При включённой загрузке заказов МойСклад сам забирает их у магазина
(``GET ?type=sale&mode=query``) и ожидает документ CommerceML 2 с заказами. Товары
сопоставляются по ``<Ид>``, равному id товара из выгрузки каталога (наш
``Product.moysklad_id``). Контрагент создаётся/находится МойСклад по этим данным;
резерв вешается самим МойСклад (настройка «Резервировать товары»).
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from lxml import etree

from app.core.config import settings

SCHEMA_VERSION = "2.04"


def _shop_local(dt: datetime, tz: ZoneInfo) -> datetime:
    """Приводит таймстамп к локальному времени магазина.

    Таймстампы (``Order.created_at`` и т.п.) хранятся в БД наивным UTC — их ставит
    Postgres ``func.now()`` в UTC-сессии контейнера, как и весь остальной код трактует
    наивные даты БД (см. ``_now_naive``). МойСклад же в CommerceML ждёт ``<Дата>``/
    ``<Время>`` заказа в **локальном** времени аккаунта (Москва). Без перевода уходило
    UTC-время, и заказ, оформленный в 15:00 МСК, приезжал как 12:00 (сдвиг на 3 часа).

    Наивный ``dt`` считаем UTC и переводим в пояс магазина через ``astimezone`` — это
    работает одинаково независимо от TZ сервера (не фиксированный сдвиг «+3»).
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(tz)

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
    tz = ZoneInfo(settings.SHOP_TIMEZONE)

    root = etree.Element("КоммерческаяИнформация")
    root.set("ВерсияСхемы", SCHEMA_VERSION)
    root.set("ДатаФормирования", datetime.now(tz).strftime("%Y-%m-%dT%H:%M:%S"))

    for order in orders:
        doc = _sub(root, "Документ")
        _sub(doc, "Ид", order.number)
        _sub(doc, "Номер", order.number)
        # created_at в БД — наивный UTC; МойСклад ждёт локальное время магазина.
        created = _shop_local(order.created_at or datetime.now(timezone.utc), tz)
        _sub(doc, "Дата", created.strftime("%Y-%m-%d"))
        _sub(doc, "Время", created.strftime("%H:%M:%S"))
        _sub(doc, "ХозОперация", "Заказ товара")
        _sub(doc, "Роль", "Продавец")
        _sub(doc, "Валюта", "руб")
        _sub(doc, "Курс", "1")
        _sub(doc, "Сумма", f"{order.total_amount:.2f}")

        # Контрагента/гостя определяем заранее — нужно и для комментария, и для блока Контрагенты.
        # Приоритет: код пользователя (стабильный/привязка к существующему контрагенту);
        # иначе телефон (гость или аккаунт без кода) — прежнее поведение.
        try:
            has_user = order.user is not None
            user_code = order.user.moysklad_ext_code if has_user else None
        except Exception:
            has_user, user_code = False, None
        ext_code = user_code or None
        # Гостевой заказ (без пользователя): единый контрагент «Заказы с сайта», если задан,
        # чтобы не плодить нового контрагента на каждый заказ гостя.
        if not ext_code and guest_ext_code:
            ext_code = guest_ext_code
        # Заказ гостя слит с общим контрагентом → под ним не видно, кто именно заказал,
        # поэтому «Гость: имя, телефон» уходит в комментарий (см. ниже).
        merged_guest = (not has_user) and bool(guest_ext_code)

        # ─── Комментарий заказа = карточка клиента ───
        # ВАЖНО: МойСклад берёт комментарий заказа из ШТАТНОГО тега <Комментарий> прямо в
        # <Документ> (значения из <ЗначенияРеквизитов> для поля комментария он НЕ использует).
        # Кладём сюда все контактные данные покупателя (имя, телефон, e-mail, ИНН), чтобы под
        # общим гостевым контрагентом заказ был опознаваем, а следом — свободный текст покупателя
        # (что он написал в заказе). Способ получения сюда НЕ добавляем — он уходит отдельным
        # реквизитом ниже.
        who = "Гость" if not has_user else "Покупатель"
        info_lines = [f"{who}: {order.customer_name}", f"Телефон: {order.customer_phone}"]
        if order.customer_email:
            info_lines.append(f"E-mail: {order.customer_email}")
        if order.customer_inn:
            info_lines.append(f"ИНН: {order.customer_inn}")
        comment_text = "\n".join(info_lines)
        if order.comment and order.comment.strip():     # свободный текст покупателя — отдельным блоком
            comment_text += "\n\n" + order.comment.strip()
        _sub(doc, "Комментарий", comment_text)

        # ─── Контрагент (покупатель) ───
        cps = _sub(doc, "Контрагенты")
        cp = _sub(cps, "Контрагент")
        # <Ид> контрагента → попадает во «Внешний код» в МойСклад (ключ сопоставления).
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
        if comment_text:                                # дубль в реквизит (подстраховка)
            r = _sub(reqs, "ЗначениеРеквизита")
            _sub(r, "Наименование", "Комментарий")
            _sub(r, "Значение", comment_text)

    return etree.tostring(root, encoding="UTF-8", xml_declaration=True, pretty_print=True)

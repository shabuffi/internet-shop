"""Тест разбора orders.xml от МойСклад (статусы заказов, приходящие обратно).

Фикстура — по реальной структуре, что прислал МойСклад: номер заказа в <Документ><Номер>,
статус в реквизитах уровня документа («Статус заказа»), плюс «Номер по 1С» и «ПометкаУдаления».
Внутри <Товар> тоже есть ЗначенияРеквизитов — не должны мешать (берём только уровень документа).
"""

from app.integrations.moysklad.commerceml_order_status import parse_order_statuses

ORDERS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация ВерсияСхемы="2.04">
  <Документ>
    <Ид>ORD-0013</Ид>
    <Номер>ORD-0013</Номер>
    <Сумма>2325.80</Сумма>
    <Товары>
      <Товар>
        <Ид>p1</Ид>
        <Артикул>ART-1</Артикул>
        <Наименование>Ёлка 1.2м</Наименование>
        <ЗначенияРеквизитов>
          <ЗначениеРеквизита><Наименование>ТипНоменклатуры</Наименование><Значение>Товар</Значение></ЗначениеРеквизита>
        </ЗначенияРеквизитов>
        <ЦенаЗаЕдиницу>1314.80</ЦенаЗаЕдиницу>
        <Количество>1.0</Количество>
        <Сумма>1314.80</Сумма>
      </Товар>
      <Товар>
        <Ид>p2</Ид>
        <Наименование>Ёлка 1.0м</Наименование>
        <ЦенаЗаЕдиницу>505.50</ЦенаЗаЕдиницу>
        <Количество>2.0</Количество>
        <Сумма>1011.00</Сумма>
      </Товар>
    </Товары>
    <ЗначенияРеквизитов>
      <ЗначениеРеквизита><Наименование>Номер по 1С</Наименование><Значение>00005</Значение></ЗначениеРеквизита>
      <ЗначениеРеквизита><Наименование>ПометкаУдаления</Наименование><Значение>false</Значение></ЗначениеРеквизита>
      <ЗначениеРеквизита><Наименование>Статус заказа</Наименование><Значение>Отгружен</Значение></ЗначениеРеквизита>
    </ЗначенияРеквизитов>
  </Документ>
</КоммерческаяИнформация>""".encode("utf-8")


def test_parse_extracts_status_and_number():
    rows = parse_order_statuses(ORDERS_XML)
    assert len(rows) == 1
    r = rows[0]
    assert r["number"] == "ORD-0013"
    assert r["status"] == "Отгружен"        # берём реквизит уровня документа, не товара
    assert r["ms_number"] == "00005"
    assert r["deleted"] is False


def test_parse_extracts_total_and_items():
    r = parse_order_statuses(ORDERS_XML)[0]
    # Сумма — прямой ребёнок Документа (общий итог), а не суммы внутри Товаров
    assert r["total"] == "2325.80"
    assert len(r["items"]) == 2
    it = r["items"][0]
    assert it["ms_id"] == "p1"
    assert it["article"] == "ART-1"
    assert it["name"] == "Ёлка 1.2м"
    assert it["price"] == "1314.80"
    assert it["quantity"] == "1.0"


def test_parse_items_none_when_no_tovary():
    x = ("""<КоммерческаяИнформация><Документ><Номер>ORD-1</Номер>"""
         """<ЗначенияРеквизитов></ЗначенияРеквизитов></Документ></КоммерческаяИнформация>""").encode("utf-8")
    assert parse_order_statuses(x)[0]["items"] is None


def test_parse_deletion_flag():
    x = ("""<КоммерческаяИнформация><Документ><Номер>ORD-9</Номер>"""
         """<ЗначенияРеквизитов><ЗначениеРеквизита><Наименование>ПометкаУдаления</Наименование>"""
         """<Значение>true</Значение></ЗначениеРеквизита></ЗначенияРеквизитов></Документ>"""
         """</КоммерческаяИнформация>""").encode("utf-8")
    r = parse_order_statuses(x)[0]
    assert r["number"] == "ORD-9"
    assert r["deleted"] is True


def test_parse_bad_xml_returns_empty():
    assert parse_order_statuses(b"not xml") == []


def test_apply_updates_items_and_total(db_session):
    """orders.xml с изменённым составом переписывает позиции и сумму заказа на сайте."""
    from decimal import Decimal
    import app.db.models.user  # noqa: F401 — регистрируем маппер User
    from app.db.models.order import Order, OrderItem
    from app.db.models.product import Product
    from app.api.v1.endpoints.exchange import _apply_order_statuses

    # товар p1 есть в каталоге (проверим привязку product_id), p2 — нет
    db_session.add(Product(id="prod-1", moysklad_id="p1", name="Ёлка 1.2м", article="ART-1",
                           price=Decimal("1200"), stock=10))
    # заказ со «старым» составом и суммой
    db_session.add(Order(id="o-13", number="ORD-0013", customer_name="И", customer_phone="+79990000000",
                         total_amount=Decimal("999.00"), status="new",
                         items=[OrderItem(product_id="prod-1", product_name="Старое имя",
                                          price=Decimal("100"), quantity=1)]))
    db_session.commit()

    n = _apply_order_statuses(db_session, ORDERS_XML)
    assert n == 1
    db_session.expire_all()
    o = db_session.get(Order, "o-13")
    assert o.total_amount == Decimal("2325.80")          # сумма из МойСклад
    assert o.moysklad_status == "Отгружен"
    items = sorted(o.items, key=lambda i: i.product_name)
    assert len(items) == 2
    assert items[0].product_name == "Ёлка 1.0м" and items[0].quantity == 2 and items[0].price == Decimal("505.50")
    assert items[0].product_id is None                   # p2 нет в каталоге
    assert items[1].product_name == "Ёлка 1.2м" and items[1].quantity == 1
    assert items[1].product_id == "prod-1"               # привязка по moysklad_id p1


def test_apply_queues_status_email_on_change(db_session, monkeypatch):
    """При смене moysklad_status ставится письмо покупателю (notify_order_status.delay)."""
    from decimal import Decimal
    import app.db.models.user  # noqa: F401
    from app.db.models.order import Order
    from app.api.v1.endpoints.exchange import _apply_order_statuses
    import app.tasks.notify as notify_mod

    queued = []
    monkeypatch.setattr(notify_mod.notify_order_status, "delay", lambda oid, st: queued.append((oid, st)))

    db_session.add(Order(id="o-st", number="ORD-0013", customer_name="И", customer_phone="+79990000000",
                         customer_email="buyer@example.ru", moysklad_status="Новый", status="new"))
    db_session.commit()

    _apply_order_statuses(db_session, ORDERS_XML)
    assert queued == [("o-st", "Отгружен")]

    # Повторный обмен с тем же статусом — письмо НЕ шлём (изменения нет)
    queued.clear()
    _apply_order_statuses(db_session, ORDERS_XML)
    assert queued == []


def test_apply_no_item_churn_when_unchanged(db_session):
    """Если состав в orders.xml совпадает с текущим — позиции не пересоздаются зря."""
    from decimal import Decimal
    import app.db.models.user  # noqa: F401
    from app.db.models.order import Order, OrderItem
    from app.api.v1.endpoints.exchange import _apply_order_statuses

    db_session.add(Order(id="o-x", number="ORD-0013", customer_name="И", customer_phone="+79990000000",
                         total_amount=Decimal("2325.80"), status="new", moysklad_status="Отгружен",
                         moysklad_number="00005",
                         items=[OrderItem(product_name="Ёлка 1.2м", product_article="ART-1",
                                          price=Decimal("1314.80"), quantity=1),
                                OrderItem(product_name="Ёлка 1.0м", price=Decimal("505.50"), quantity=2)]))
    db_session.commit()
    ids_before = {i.id for i in db_session.get(Order, "o-x").items}

    n = _apply_order_statuses(db_session, ORDERS_XML)
    assert n == 0                                        # ничего не изменилось
    db_session.expire_all()
    ids_after = {i.id for i in db_session.get(Order, "o-x").items}
    assert ids_before == ids_after                      # те же строки позиций


def test_apply_status_cancelled_marks_order(db_session):
    """Статус «Отменён» из МойСклад помечает заказ отменённым (status=cancelled), не только ms_status."""
    from decimal import Decimal
    import app.db.models.user  # noqa: F401
    from app.db.models.order import Order
    from app.api.v1.endpoints.exchange import _apply_order_statuses

    db_session.add(Order(id="o-c", number="ORD-0099", customer_name="И", customer_phone="+79990000000",
                         total_amount=Decimal("100"), status="new"))
    db_session.commit()

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<КоммерческаяИнформация><Документ>'
        '<Номер>ORD-0099</Номер>'
        '<ЗначенияРеквизитов><ЗначениеРеквизита>'
        '<Наименование>Статус заказа</Наименование><Значение>Отменён</Значение>'
        '</ЗначениеРеквизита></ЗначенияРеквизитов>'
        '</Документ></КоммерческаяИнформация>'
    ).encode("utf-8")

    n = _apply_order_statuses(db_session, xml)
    assert n == 1
    db_session.expire_all()
    o = db_session.get(Order, "o-c")
    assert o.status == "cancelled"
    assert o.moysklad_status == "Отменён"

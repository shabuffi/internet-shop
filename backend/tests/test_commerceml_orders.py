"""Тесты выгрузки заказов в МойСклад через обмен CommerceML (сериализатор + эндпоинт)."""

from datetime import datetime
from decimal import Decimal

from lxml import etree

from app.db.models.order import Order, OrderItem
from app.db.models.product import Product
from app.integrations.moysklad.commerceml_orders import build_orders_xml


def _order(**kw):
    defaults = dict(
        number="ORD-0005", customer_name="Софья Шабунова", customer_phone="+79622440886",
        total_amount=Decimal("24.90"), status="new", created_at=datetime(2026, 6, 8, 17, 51, 0),
    )
    defaults.update(kw)
    return Order(**defaults)


# ─── сериализатор ────────────────────────────────────────────────────────────

def test_build_orders_xml_structure():
    order = _order(
        customer_email="s@mail.ru", delivery_address="Москва, ул. Ленина 1", comment="код 1234",
        items=[OrderItem(product_id="p-int", product_name="Hydra Soft Cream",
                         product_article="HSC-001", price=Decimal("24.90"), quantity=1)],
    )
    xml = build_orders_xml([order], {"p-int": "ms-hydra-id"})
    root = etree.fromstring(xml)
    assert root.tag == "КоммерческаяИнформация"

    doc = root.find("Документ")
    assert doc.find("Номер").text == "ORD-0005"
    assert doc.find("ХозОперация").text == "Заказ товара"
    assert doc.find("Сумма").text == "24.90"

    cp = doc.find("Контрагенты/Контрагент")
    assert cp.find("Наименование").text == "Софья Шабунова"
    phones = [c.find("Значение").text for c in cp.findall("Контакты/Контакт")]
    assert "+79622440886" in phones
    assert "s@mail.ru" in phones

    tovar = doc.find("Товары/Товар")
    assert tovar.find("Ид").text == "ms-hydra-id"        # сопоставление по moysklad_id
    assert tovar.find("Количество").text == "1"
    assert tovar.find("ЦенаЗаЕдиницу").text == "24.90"

    reqs = {r.find("Наименование").text: r.find("Значение").text
            for r in doc.findall("ЗначенияРеквизитов/ЗначениеРеквизита")}
    assert reqs["Адрес доставки"] == "Москва, ул. Ленина 1"
    # Комментарий = карточка клиента (имя/телефон/e-mail); свободный текст «код 1234» в него НЕ входит
    native = doc.find("Комментарий").text
    assert "Софья Шабунова" in native and "Телефон: +79622440886" in native and "E-mail: s@mail.ru" in native
    assert "код 1234" not in native
    assert reqs["Комментарий"] == native        # дубль в реквизите совпадает со штатным тегом


def test_build_orders_xml_skips_unmapped_product():
    order = _order(items=[OrderItem(product_id="px", product_name="X", price=Decimal("10"), quantity=1)])
    root = etree.fromstring(build_orders_xml([order], {}))   # нет сопоставления
    assert root.find("Документ/Товары/Товар") is None


def test_build_orders_xml_empty():
    root = etree.fromstring(build_orders_xml([], {}))
    assert root.tag == "КоммерческаяИнформация"
    assert root.find("Документ") is None


# ─── эндпоинт обмена: query / success ────────────────────────────────────────

def _seed_order(db, oid="o1", number="ORD-1", status="new", exported_at=None):
    db.add(Product(id="p1", moysklad_id="ms-1", name="Товар", article="A",
                   price=Decimal("10"), stock=5))
    db.add(Order(id=oid, number=number, customer_name="Иван", customer_phone="+79001234567",
                 total_amount=Decimal("20"), status=status, exported_at=exported_at,
                 items=[OrderItem(product_id="p1", product_name="Товар", price=Decimal("10"), quantity=2)]))
    db.commit()


def test_exchange_query_returns_orders(client, db_session):
    _seed_order(db_session)
    resp = client.get("/api/v1/1c/exchange?mode=query")
    assert resp.status_code == 200
    root = etree.fromstring(resp.content)
    doc = root.find("Документ")
    assert doc is not None
    assert doc.find("Номер").text == "ORD-1"
    assert doc.find("Товары/Товар/Ид").text == "ms-1"    # позиция по moysklad_id


def test_exchange_query_then_success_marks_exported(client, db_session):
    _seed_order(db_session)
    client.get("/api/v1/1c/exchange?mode=query")
    resp = client.get("/api/v1/1c/exchange?mode=success")
    assert resp.text == "success"
    db_session.expire_all()
    assert db_session.get(Order, "o1").exported_at is not None


def test_exchange_query_excludes_exported_and_cancelled(client, db_session):
    db_session.add(Product(id="p1", moysklad_id="ms-1", name="Т", article="A",
                           price=Decimal("10"), stock=5))
    db_session.add(Order(id="exp", number="ORD-EXP", customer_name="И", customer_phone="+79001234567",
                         total_amount=Decimal("10"), status="new", exported_at=datetime(2026, 1, 1),
                         items=[OrderItem(product_id="p1", product_name="Т", price=Decimal("10"), quantity=1)]))
    db_session.add(Order(id="can", number="ORD-CAN", customer_name="И", customer_phone="+79001234567",
                         total_amount=Decimal("10"), status="cancelled",
                         items=[OrderItem(product_id="p1", product_name="Т", price=Decimal("10"), quantity=1)]))
    db_session.commit()

    root = etree.fromstring(client.get("/api/v1/1c/exchange?mode=query").content)
    numbers = [d.find("Номер").text for d in root.findall("Документ")]
    assert "ORD-EXP" not in numbers     # уже выгружен
    assert "ORD-CAN" not in numbers     # отменён


# ─── контрагент: код пользователя / гостевой код / телефон + пометка гостя ───

def _one_item_order(**kw):
    return _order(items=[OrderItem(product_id="p-int", product_name="Т",
                                   price=Decimal("10"), quantity=1)], **kw)


def _comment(root):
    for r in root.findall("Документ/ЗначенияРеквизитов/ЗначениеРеквизита"):
        if r.find("Наименование").text == "Комментарий":
            return r.find("Значение").text
    return None


def test_guest_order_uses_guest_ext_code_and_tags_comment():
    """Гость + единый контрагент → <Ид>=гостевой код, а в комментарий добавлен «Гость: …»."""
    order = _one_item_order()
    root = etree.fromstring(build_orders_xml([order], {"p-int": "ms-1"}, guest_ext_code="GUEST-1"))
    assert root.find("Документ/Контрагенты/Контрагент/Ид").text == "GUEST-1"
    # Штатный тег <Комментарий> прямо в <Документ> — его МойСклад тянет в поле комментария заказа
    native = root.find("Документ/Комментарий")
    assert native is not None and native.text.startswith("Гость:")
    # и дубль в реквизите — подстраховка
    assert _comment(root).startswith("Гость:")


def test_guest_order_without_code_uses_phone():
    """Гость без единого контрагента → <Ид>=телефон (свой контрагент); карточка клиента всё равно есть."""
    order = _one_item_order()
    root = etree.fromstring(build_orders_xml([order], {"p-int": "ms-1"}))
    assert root.find("Документ/Контрагенты/Контрагент/Ид").text == order.customer_phone
    assert _comment(root).startswith("Гость:")


def test_registered_user_uses_own_ext_code_labeled_buyer():
    """Зарегистрированный → <Ид>=его код контрагента; в комментарии карточка «Покупатель: …»."""
    from app.db.models.user import User
    u = User(email="u@ya.ru", phone="+79001234567", customer_type="individual",
             customer_name="К", password_hash="x", moysklad_ext_code="USER-CODE")
    order = _one_item_order(user=u)
    root = etree.fromstring(build_orders_xml([order], {"p-int": "ms-1"}, guest_ext_code="GUEST-1"))
    assert root.find("Документ/Контрагенты/Контрагент/Ид").text == "USER-CODE"
    assert _comment(root).startswith("Покупатель:")

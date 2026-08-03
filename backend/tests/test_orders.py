"""Тесты создания заказа через API — критичный путь (деньги!)."""

from decimal import Decimal

import pytest

from app.api.v1.endpoints.auth import _hash_password
from app.db.models.product import Product
from app.db.models.user import User
from app.services.pricing import percent_for


@pytest.fixture(autouse=True)
def _no_rate_limit(monkeypatch):
    """Отключаем rate-limit в HTTP-тестах (иначе TestClient упрётся в лимит по IP).

    И в orders, и в auth: тесты активации логинятся покупателем перед заказом.
    """
    from app.api.v1.endpoints import orders as orders_mod
    from app.api.v1.endpoints import auth as auth_mod
    monkeypatch.setattr(orders_mod, "rate_limit", lambda *a, **k: None)
    monkeypatch.setattr(auth_mod, "rate_limit", lambda *a, **k: None)


@pytest.fixture
def no_celery(monkeypatch):
    """Глушим фоновую задачу уведомления, чтобы тест не лез в брокер Celery."""
    import app.tasks.notify as notify_mod
    monkeypatch.setattr(notify_mod.notify_new_order, "delay", lambda *a, **k: None)


def _make_product(db, id="p-1", price=Decimal("100.00"), stock=5, active=True):
    p = Product(id=id, moysklad_id=f"ms-{id}", name="Товар", article=f"ART-{id}",
                price=price, stock=stock, is_active=active)
    db.add(p)
    db.commit()
    return p


def test_create_order_success(client, db_session, no_celery):
    _make_product(db_session, id="p-1", price=Decimal("3000.00"))
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван",
        "customer_phone": "+7 900 123-45-67",
        "customer_email": "buyer@example.ru",
        "delivery_method": "pickup",
        "items": [{"product_id": "p-1", "quantity": 2}],
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "new"
    assert data["number"].startswith("ORD-")
    assert len(data["items"]) == 1
    # сумма по цене ИЗ БД (гость видит базовую цену МойСклад без наценки: 3000 * 2), не из запроса
    assert float(data["total_amount"]) == 6000.0


def test_create_order_price_from_db_not_client(client, db_session, no_celery):
    """Даже если клиент пришлёт цену — она игнорируется, берётся из БД."""
    _make_product(db_session, id="p-1", price=Decimal("6000.00"))
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван",
        "customer_phone": "+79001234567",
        "customer_email": "buyer@example.ru",
        "delivery_method": "pickup",
        "items": [{"product_id": "p-1", "quantity": 1, "price": "1"}],  # цена-подделка
    })
    assert resp.status_code == 201
    # цена клиента игнорируется: берётся 6000 из БД (гость — базовая цена без наценки)
    assert float(resp.json()["total_amount"]) == 6000.0


def test_create_order_missing_product(client, db_session, no_celery):
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван",
        "customer_phone": "+79001234567",
        "items": [{"product_id": "no-such", "quantity": 1}],
    })
    assert resp.status_code == 422


def test_create_order_empty_cart(client, db_session, no_celery):
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван",
        "customer_phone": "+79001234567",
        "items": [],
    })
    assert resp.status_code == 422


def test_create_order_invalid_phone(client, db_session, no_celery):
    _make_product(db_session, id="p-1")
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван",
        "customer_phone": "123",   # меньше 10 цифр
        "items": [{"product_id": "p-1", "quantity": 1}],
    })
    assert resp.status_code == 422


def _err_fields(resp) -> list[str]:
    """Имена полей из 422 — их подсвечивает форма на фронте."""
    return [e["loc"][-1] for e in resp.json()["detail"]]


def test_create_order_invalid_email_reports_field(client, db_session, no_celery):
    """Кривой e-mail → 422 с указанием поля customer_email (форма подсветит его)."""
    _make_product(db_session, id="p-1")
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван",
        "customer_phone": "+79001234567",
        "customer_email": "не-почта",
        "delivery_method": "pickup",
        "items": [{"product_id": "p-1", "quantity": 1}],
    })
    assert resp.status_code == 422
    assert "customer_email" in _err_fields(resp)


def test_create_order_blank_name_reports_field(client, db_session, no_celery):
    """Имя из пробелов → 422 по полю customer_name."""
    _make_product(db_session, id="p-1")
    resp = client.post("/api/v1/orders", json={
        "customer_name": "   ",
        "customer_phone": "+79001234567",
        "delivery_method": "pickup",
        "items": [{"product_id": "p-1", "quantity": 1}],
    })
    assert resp.status_code == 422
    assert "customer_name" in _err_fields(resp)


def test_create_order_empty_email_rejected(client, db_session, no_celery):
    """E-mail обязателен: пустая строка → 422 по полю customer_email."""
    _make_product(db_session, id="p-1", price=Decimal("3000.00"))   # выше минимальной суммы
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван",
        "customer_phone": "+79001234567",
        "customer_email": "",
        "delivery_method": "pickup",
        "items": [{"product_id": "p-1", "quantity": 2}],
    })
    assert resp.status_code == 422
    assert "customer_email" in _err_fields(resp)


# ─── остаток не считается ────────────────────────────────────────────────────

def test_create_order_does_not_change_stock(client, db_session, no_celery):
    """Заказ не меняет остаток (количество на сайте от заказов не зависит)."""
    _make_product(db_session, id="p-1", stock=5, price=Decimal("2600.00"))
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван", "customer_phone": "+79001234567",
        "customer_email": "buyer@example.ru",
        "delivery_method": "pickup",
        "items": [{"product_id": "p-1", "quantity": 2}],
    })
    assert resp.status_code == 201
    db_session.expire_all()
    assert db_session.get(Product, "p-1").stock == 5   # остаток не тронут


def test_create_order_succeeds_with_zero_stock(client, db_session, no_celery):
    """Заказ проходит даже при нулевом остатке (остаток больше не влияет)."""
    _make_product(db_session, id="p-1", stock=0, price=Decimal("2000.00"))
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван", "customer_phone": "+79001234567",
        "customer_email": "buyer@example.ru",
        "delivery_method": "pickup",
        "items": [{"product_id": "p-1", "quantity": 3}],
    })
    assert resp.status_code == 201


def test_create_order_below_minimum_rejected(client, db_session, no_celery):
    """Заказ дешевле минимальной суммы (5000 ₽) отклоняется с 422."""
    _make_product(db_session, id="p-1", price=Decimal("100.00"))
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван", "customer_phone": "+79001234567",
        "customer_email": "buyer@example.ru",
        "delivery_method": "pickup",
        "items": [{"product_id": "p-1", "quantity": 1}],  # 100 ₽ < 5000 ₽
    })
    assert resp.status_code == 422
    assert "инимальная сумма" in resp.json()["detail"]


def test_create_order_negative_quantity_rejected(client, db_session, no_celery):
    _make_product(db_session, id="p-1", stock=5)
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван", "customer_phone": "+79001234567",
        "items": [{"product_id": "p-1", "quantity": -3}],
    })
    assert resp.status_code == 422


# ─── активация аккаунта ──────────────────────────────────────────────────────
# Инцидент 03.08.2026: клиент зарегистрировался и оформил заказ за 15 минут ДО того,
# как сотрудник ТД активировал аккаунт, — и получил клиентскую цену вместо гостевой.

def _make_customer(db, is_active=True, discount=Decimal("0"), **kw):
    defaults = dict(
        email="client@yandex.ru", phone="+79005554433", customer_type="individual",
        customer_name="Пётр Петров", password_hash=_hash_password("Parol123"),
        is_active=is_active, discount_percent=discount,
    )
    defaults.update(kw)
    u = User(**defaults)
    db.add(u)
    db.commit()
    return u


def test_create_order_rejected_for_inactive_user(client, db_session, no_celery):
    """Вошедший неактивированный покупатель заказ оформить НЕ может (403)."""
    _make_product(db_session, id="p-1", price=Decimal("6000.00"))
    _make_customer(db_session, is_active=False)
    assert client.post("/api/v1/auth/login",
                       json={"email": "client@yandex.ru", "password": "Parol123"}).status_code == 200

    resp = client.post("/api/v1/orders", json={
        "customer_name": "Пётр Петров", "customer_phone": "+79005554433",
        "customer_email": "client@yandex.ru", "delivery_method": "pickup",
        "items": [{"product_id": "p-1", "quantity": 1}],
    })
    assert resp.status_code == 403
    assert "активирована" in resp.json()["detail"]
    from app.db.models.order import Order
    assert db_session.query(Order).count() == 0     # заказ не создан


def test_create_order_allowed_for_active_user(client, db_session, no_celery):
    """Активированный покупатель заказывает по своей персональной цене."""
    _make_product(db_session, id="p-1", price=Decimal("6000.00"))
    user = _make_customer(db_session, is_active=True, discount=Decimal("-10"))
    assert client.post("/api/v1/auth/login",
                       json={"email": "client@yandex.ru", "password": "Parol123"}).status_code == 200

    resp = client.post("/api/v1/orders", json={
        "customer_name": "Пётр Петров", "customer_phone": "+79005554433",
        "customer_email": "client@yandex.ru", "delivery_method": "pickup",
        "items": [{"product_id": "p-1", "quantity": 1}],
    })
    assert resp.status_code == 201
    assert float(resp.json()["total_amount"]) == 5400.0     # 6000 − 10%
    from app.db.models.order import Order
    assert db_session.query(Order).one().user_id == user.id


def test_create_order_still_open_for_guest(client, db_session, no_celery):
    """Гостя (без входа) блокировка не касается — гостевой заказ проходит как раньше."""
    _make_product(db_session, id="p-1", price=Decimal("6000.00"))
    _make_customer(db_session, is_active=False)             # чей-то неактивный аккаунт в БД
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван", "customer_phone": "+79001234567",
        "customer_email": "buyer@example.ru", "delivery_method": "pickup",
        "items": [{"product_id": "p-1", "quantity": 1}],
    })
    assert resp.status_code == 201
    assert resp.json()["number"].startswith("ORD-")


def test_percent_for_treats_inactive_as_guest(db_session):
    """Цена: неактивированный считается гостем — свою скидку он не получает."""
    inactive = _make_customer(db_session, is_active=False, discount=Decimal("-10"))
    active = _make_customer(db_session, is_active=True, discount=Decimal("-10"),
                            email="a@yandex.ru", phone="+79001110022")
    assert percent_for(None) is None            # гость → наценка по умолчанию
    assert percent_for(inactive) is None        # неактивированный → тоже гость
    assert percent_for(active) == Decimal("-10")


def test_create_order_queues_notification(client, db_session, monkeypatch):
    """Создание заказа ставит в очередь уведомление владельцу."""
    import app.tasks.notify as notify_mod
    queued = []
    monkeypatch.setattr(notify_mod.notify_new_order, "delay", lambda oid: queued.append(oid))
    _make_product(db_session, id="p-1", stock=5, price=Decimal("5000.00"))
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван", "customer_phone": "+79001234567",
        "customer_email": "buyer@example.ru",
        "delivery_method": "pickup",
        "items": [{"product_id": "p-1", "quantity": 1}],
    })
    assert resp.status_code == 201
    assert len(queued) == 1

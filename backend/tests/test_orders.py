"""Тесты создания заказа через API — критичный путь (деньги!)."""

from decimal import Decimal

import pytest

from app.db.models.product import Product


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
    _make_product(db_session, id="p-1", price=Decimal("150.00"))
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван",
        "customer_phone": "+7 900 123-45-67",
        "items": [{"product_id": "p-1", "quantity": 2}],
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "new"
    assert data["number"].startswith("ORD-")
    assert len(data["items"]) == 1
    # сумма посчитана по цене ИЗ БД (150 * 2), а не из запроса
    assert float(data["total_amount"]) == 300.0


def test_create_order_price_from_db_not_client(client, db_session, no_celery):
    """Даже если клиент пришлёт цену — она игнорируется, берётся из БД."""
    _make_product(db_session, id="p-1", price=Decimal("999.00"))
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван",
        "customer_phone": "+79001234567",
        "items": [{"product_id": "p-1", "quantity": 1, "price": "1"}],  # цена-подделка
    })
    assert resp.status_code == 201
    assert float(resp.json()["total_amount"]) == 999.0


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


# ─── остаток не считается ────────────────────────────────────────────────────

def test_create_order_does_not_change_stock(client, db_session, no_celery):
    """Заказ не меняет остаток (количество на сайте от заказов не зависит)."""
    _make_product(db_session, id="p-1", stock=5)
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван", "customer_phone": "+79001234567",
        "items": [{"product_id": "p-1", "quantity": 2}],
    })
    assert resp.status_code == 201
    db_session.expire_all()
    assert db_session.get(Product, "p-1").stock == 5   # остаток не тронут


def test_create_order_succeeds_with_zero_stock(client, db_session, no_celery):
    """Заказ проходит даже при нулевом остатке (остаток больше не влияет)."""
    _make_product(db_session, id="p-1", stock=0)
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван", "customer_phone": "+79001234567",
        "items": [{"product_id": "p-1", "quantity": 3}],
    })
    assert resp.status_code == 201


def test_create_order_negative_quantity_rejected(client, db_session, no_celery):
    _make_product(db_session, id="p-1", stock=5)
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван", "customer_phone": "+79001234567",
        "items": [{"product_id": "p-1", "quantity": -3}],
    })
    assert resp.status_code == 422


def test_create_order_queues_notification(client, db_session, monkeypatch):
    """Создание заказа ставит в очередь уведомление владельцу."""
    import app.tasks.notify as notify_mod
    queued = []
    monkeypatch.setattr(notify_mod.notify_new_order, "delay", lambda oid: queued.append(oid))
    _make_product(db_session, id="p-1", stock=5)
    resp = client.post("/api/v1/orders", json={
        "customer_name": "Иван", "customer_phone": "+79001234567",
        "items": [{"product_id": "p-1", "quantity": 1}],
    })
    assert resp.status_code == 201
    assert len(queued) == 1

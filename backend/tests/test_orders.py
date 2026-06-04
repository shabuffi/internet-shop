"""Тесты создания заказа через API — критичный путь (деньги!)."""

from decimal import Decimal

import pytest

from app.db.models.product import Product


@pytest.fixture
def no_celery(monkeypatch):
    """Глушим отправку в МойСклад (Celery), чтобы тест не лез в брокер."""
    import app.tasks.sync as sync_mod
    monkeypatch.setattr(sync_mod.push_order_to_moysklad, "delay", lambda *a, **k: None)


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

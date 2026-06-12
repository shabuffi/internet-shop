"""Тесты смены статуса заказа в админке (валидация + авторизация)."""

from decimal import Decimal

import pytest

from app.db.models.admin import AdminUser
from app.db.models.order import Order
from app.api.v1.endpoints.admin import _create_token, _hash_password


@pytest.fixture
def token(db_session):
    db_session.add(AdminUser(username="admin", password_hash=_hash_password("password123")))
    db_session.commit()
    return _create_token("admin")


@pytest.fixture
def order(db_session):
    o = Order(id="o-1", number="ORD-0001", customer_name="Иван",
              customer_phone="+79001234567", total_amount=Decimal("0"), status="new")
    db_session.add(o)
    db_session.commit()
    return o


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_update_status_valid(client, token, order):
    resp = client.patch("/api/v1/admin/orders/o-1/status", json={"status": "cancelled"}, headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


def test_update_status_invalid_value(client, token, order):
    # «shipped/confirmed/delivered» больше не принимаются — только new/cancelled
    resp = client.patch("/api/v1/admin/orders/o-1/status", json={"status": "shipped"}, headers=_auth(token))
    assert resp.status_code == 422


def test_update_status_missing_order(client, token):
    resp = client.patch("/api/v1/admin/orders/nope/status", json={"status": "new"}, headers=_auth(token))
    assert resp.status_code == 404


def test_update_status_requires_auth(client, order):
    resp = client.patch("/api/v1/admin/orders/o-1/status", json={"status": "new"})
    assert resp.status_code == 401


# ─── отмена заказа (остаток не трогаем) ──────────────────────────────────────

def test_cancel_order_sets_status_without_touching_stock(client, token, db_session):
    from app.db.models.product import Product
    from app.db.models.order import OrderItem

    db_session.add(Product(id="pp", moysklad_id="ms-pp", name="Товар", article="ART",
                           price=Decimal("100"), stock=3))
    db_session.add(Order(id="oc", number="ORD-9", customer_name="И", customer_phone="+79001234567",
                         total_amount=Decimal("200"), status="new",
                         items=[OrderItem(product_id="pp", product_name="Товар", product_article="ART",
                                          price=Decimal("100"), quantity=2)]))
    db_session.commit()

    resp = client.patch("/api/v1/admin/orders/oc/status", json={"status": "cancelled"}, headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
    db_session.expire_all()
    assert db_session.get(Product, "pp").stock == 3   # остаток не изменился


# ─── наличие товара (ручной флаг) ────────────────────────────────────────────

def test_set_product_availability(client, token, db_session):
    from app.db.models.product import Product
    db_session.add(Product(id="ap", moysklad_id="ms-ap", name="Товар", article="A",
                           price=Decimal("10"), stock=0, available=True))
    db_session.commit()

    resp = client.patch("/api/v1/admin/products/ap/availability",
                        json={"available": False}, headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["available"] is False
    db_session.expire_all()
    assert db_session.get(Product, "ap").available is False


def test_set_product_availability_missing(client, token):
    resp = client.patch("/api/v1/admin/products/nope/availability",
                        json={"available": True}, headers=_auth(token))
    assert resp.status_code == 404


# ─── загрузка/удаление фото товара в админке ─────────────────────────────────

def test_upload_and_delete_product_image(client, token, db_session, monkeypatch, tmp_path):
    import app.services.media_storage as media
    from app.db.models.product import Product
    monkeypatch.setattr(media.settings, "MEDIA_DIR", str(tmp_path))
    db_session.add(Product(id="up", moysklad_id="ms-up", name="T", article="A",
                           price=Decimal("10"), stock=0))
    db_session.commit()

    # загрузка
    resp = client.post("/api/v1/admin/products/up/images",
                       files={"file": ("photo.png", b"PNGDATA", "image/png")}, headers=_auth(token))
    assert resp.status_code == 200
    imgs = resp.json()["images"]
    assert len(imgs) == 1 and imgs[0].startswith("upload_") and imgs[0].endswith(".png")
    db_session.expire_all()
    p = db_session.get(Product, "up")
    assert p.image_url == imgs[0]
    assert p.images_manual is True

    # удаление
    resp = client.delete(f"/api/v1/admin/products/up/images?filename={imgs[0]}", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["images"] == []


def test_upload_rejects_non_image(client, token, db_session, monkeypatch, tmp_path):
    import app.services.media_storage as media
    from app.db.models.product import Product
    monkeypatch.setattr(media.settings, "MEDIA_DIR", str(tmp_path))
    db_session.add(Product(id="up2", moysklad_id="ms-up2", name="T", article="A",
                           price=Decimal("10"), stock=0))
    db_session.commit()
    resp = client.post("/api/v1/admin/products/up2/images",
                       files={"file": ("doc.txt", b"hello", "text/plain")}, headers=_auth(token))
    assert resp.status_code == 400


# ─── список заказов ──────────────────────────────────────────────────────────

def test_list_orders_returns_orders_with_items(client, token, db_session):
    """Список заказов отдаёт заказы с позициями (регрессия на joinedload без .unique())."""
    from app.db.models.product import Product
    from app.db.models.order import OrderItem

    db_session.add(Product(id="lp", moysklad_id="ms-lp", name="Т", article="A",
                           price=Decimal("10"), stock=5))
    db_session.add(Order(id="lo", number="ORD-LIST", customer_name="Иван",
                         customer_phone="+79001234567", total_amount=Decimal("20"), status="new",
                         items=[OrderItem(product_id="lp", product_name="Т", price=Decimal("10"), quantity=2)]))
    db_session.commit()

    resp = client.get("/api/v1/admin/orders", headers=_auth(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["number"] == "ORD-LIST"
    assert data["items"][0]["items_count"] == 1   # одна позиция (количество=2 внутри неё)

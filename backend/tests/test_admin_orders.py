"""Тесты админки: наличие товара, фото, уведомления, список заказов.

Статус заказа ведётся в МойСклад (приходит в orders.xml) — на сайте не меняется,
поэтому ручного PATCH /orders/{id}/status и тестов на него больше нет.
"""

from decimal import Decimal

import pytest

from app.db.models.admin import AdminUser
from app.api.v1.endpoints.admin import _create_token, _hash_password


@pytest.fixture
def token(db_session):
    db_session.add(AdminUser(username="admin", password_hash=_hash_password("password123")))
    db_session.commit()
    return _create_token("admin")


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


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


# ─── пробное уведомление (ВК / Email) ────────────────────────────────────────

def test_test_notification_no_channels(client, token, monkeypatch):
    import app.integrations.notify as notify
    monkeypatch.setattr(notify, "get_notify_config",
                        lambda: {"vk_token": "", "vk_peer": ""})
    resp = client.post("/api/v1/admin/test-notification", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["results"] == {}


def test_test_notification_vk_sent(client, token, monkeypatch):
    import app.integrations.notify as notify
    monkeypatch.setattr(notify, "get_notify_config",
                        lambda: {"vk_token": "V", "vk_peer": "42"})
    monkeypatch.setattr(notify, "send_vk", lambda *a, **k: True)
    resp = client.post("/api/v1/admin/test-notification", headers=_auth(token))
    assert resp.json()["results"] == {"vk": "sent"}


def test_test_notification_vk_failed(client, token, monkeypatch):
    import app.integrations.notify as notify
    monkeypatch.setattr(notify, "get_notify_config",
                        lambda: {"vk_token": "V", "vk_peer": "42"})
    monkeypatch.setattr(notify, "send_vk", lambda *a, **k: False)
    resp = client.post("/api/v1/admin/test-notification", headers=_auth(token))
    assert resp.json()["results"] == {"vk": "failed"}


def test_test_notification_email_falls_back_to_smtp_user(client, token, db_session, monkeypatch):
    """Если «Email владельца» пуст — письмо идёт на адрес из SMTP-логина."""
    import app.integrations.email as email_mod
    import app.integrations.notify as notify
    from app.db.models.admin import ShopSettings
    monkeypatch.setattr(notify, "get_notify_config", lambda: {"vk_token": "", "vk_peer": ""})
    db_session.merge(ShopSettings(key="smtp_user", value="shop@yandex.ru"))
    db_session.commit()
    captured = {}
    monkeypatch.setattr(email_mod, "send_email_detail",
                        lambda to, subject, body, from_name="Магазин": captured.update(to=to) or (True, None))
    r = client.post("/api/v1/admin/test-notification?channel=email", headers=_auth(token)).json()
    assert r["results"] == {"email": "sent"}
    assert captured["to"] == "shop@yandex.ru"


def test_test_notification_single_channel_only(client, token, db_session, monkeypatch):
    """channel=vk тестирует только ВК, email не трогает (даже если настроен)."""
    import app.integrations.email as email_mod
    import app.integrations.notify as notify
    from app.db.models.admin import ShopSettings
    monkeypatch.setattr(notify, "get_notify_config", lambda: {"vk_token": "V", "vk_peer": "2"})
    monkeypatch.setattr(notify, "send_vk", lambda *a, **k: True)
    db_session.merge(ShopSettings(key="notify_email", value="o@mail.ru"))
    db_session.commit()
    monkeypatch.setattr(email_mod, "send_email",
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError("email не должен вызываться")))
    r = client.post("/api/v1/admin/test-notification?channel=vk", headers=_auth(token)).json()
    assert r["results"] == {"vk": "sent"}


# ─── список заказов ──────────────────────────────────────────────────────────

def test_list_orders_returns_orders_with_items(client, token, db_session):
    """Список заказов отдаёт заказы с позициями (регрессия на joinedload без .unique())."""
    from app.db.models.product import Product
    from app.db.models.order import Order, OrderItem

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
    # состав заказа виден в админке (что именно заказывали)
    line = data["items"][0]["items"][0]
    assert line["product_name"] == "Т" and line["quantity"] == 2

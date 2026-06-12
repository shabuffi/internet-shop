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


# ─── пробное уведомление ─────────────────────────────────────────────────────

def test_test_notification_no_channels(client, token, monkeypatch):
    import app.integrations.notify as notify
    monkeypatch.setattr(notify, "get_notify_config",
                        lambda: {"tg_token": "", "tg_chat": "", "vk_token": "", "vk_peer": ""})
    resp = client.post("/api/v1/admin/test-notification", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json()["results"] == {}


def test_test_notification_telegram_sent(client, token, monkeypatch):
    import app.integrations.notify as notify
    import app.api.v1.endpoints.admin as admin_mod
    monkeypatch.setattr(notify, "get_notify_config",
                        lambda: {"tg_token": "T", "tg_chat": "123", "vk_token": "", "vk_peer": ""})
    monkeypatch.setattr(admin_mod.httpx, "post", lambda *a, **k: _FakeResp({"ok": True, "result": {}}))
    resp = client.post("/api/v1/admin/test-notification", headers=_auth(token))
    assert resp.json()["results"] == {"telegram": "sent"}


def test_test_notification_telegram_failed_with_reason(client, token, monkeypatch):
    import app.integrations.notify as notify
    import app.api.v1.endpoints.admin as admin_mod
    monkeypatch.setattr(notify, "get_notify_config",
                        lambda: {"tg_token": "T", "tg_chat": "123", "vk_token": "", "vk_peer": ""})
    monkeypatch.setattr(admin_mod.httpx, "post",
                        lambda *a, **k: _FakeResp({"ok": False, "description": "Forbidden: bot was blocked"}, 403))
    d = client.post("/api/v1/admin/test-notification", headers=_auth(token)).json()
    assert d["results"] == {"telegram": "failed"}
    assert "Forbidden" in d["details"]["telegram"]


def test_test_notification_telegram_timeout_reason(client, token, monkeypatch):
    import httpx
    import app.integrations.notify as notify
    import app.api.v1.endpoints.admin as admin_mod
    monkeypatch.setattr(notify, "get_notify_config",
                        lambda: {"tg_token": "T", "tg_chat": "123", "vk_token": "", "vk_peer": ""})
    def _boom(*a, **k):
        raise httpx.ConnectTimeout("timed out")
    monkeypatch.setattr(admin_mod.httpx, "post", _boom)
    d = client.post("/api/v1/admin/test-notification", headers=_auth(token)).json()
    assert d["results"] == {"telegram": "failed"}
    assert "Telegram" in d["details"]["telegram"]


def test_test_notification_email_falls_back_to_smtp_user(client, token, db_session, monkeypatch):
    """Если «Email владельца» пуст — письмо идёт на адрес из SMTP-логина."""
    import app.integrations.email as email_mod
    import app.integrations.notify as notify
    from app.db.models.admin import ShopSettings
    monkeypatch.setattr(notify, "get_notify_config",
                        lambda: {"tg_token": "", "tg_chat": "", "vk_token": "", "vk_peer": ""})
    db_session.merge(ShopSettings(key="smtp_user", value="shop@yandex.ru"))
    db_session.commit()
    captured = {}
    monkeypatch.setattr(email_mod, "send_email",
                        lambda to, subject, body, from_name="Магазин": captured.update(to=to) or True)
    r = client.post("/api/v1/admin/test-notification?channel=email", headers=_auth(token)).json()
    assert r["results"] == {"email": "sent"}
    assert captured["to"] == "shop@yandex.ru"


def test_test_notification_single_channel_only(client, token, monkeypatch):
    """channel=telegram тестирует только Telegram, ВК не трогает (даже если настроен)."""
    import app.integrations.notify as notify
    import app.api.v1.endpoints.admin as admin_mod
    monkeypatch.setattr(notify, "get_notify_config",
                        lambda: {"tg_token": "T", "tg_chat": "1", "vk_token": "V", "vk_peer": "2"})
    monkeypatch.setattr(admin_mod.httpx, "post", lambda *a, **k: _FakeResp({"ok": True}))
    monkeypatch.setattr(notify, "send_vk", lambda *a, **k: (_ for _ in ()).throw(AssertionError("ВК не должен вызываться")))
    r = client.post("/api/v1/admin/test-notification?channel=telegram", headers=_auth(token)).json()
    assert r["results"] == {"telegram": "sent"}


# ─── Telegram: токен из .env + автопривязка chat_id ──────────────────────────

class _FakeResp:
    def __init__(self, payload, status_code=200): self._p = payload; self.status_code = status_code
    def json(self): return self._p
    @property
    def text(self): return str(self._p)


def test_telegram_status_no_token(client, token, monkeypatch):
    import app.integrations.notify as notify
    monkeypatch.setattr(notify, "get_notify_config",
                        lambda: {"tg_token": "", "tg_chat": "", "vk_token": "", "vk_peer": ""})
    resp = client.get("/api/v1/admin/telegram/status", headers=_auth(token))
    assert resp.json()["token_present"] is False


def test_telegram_status_with_token(client, token, monkeypatch):
    import app.integrations.notify as notify
    import app.api.v1.endpoints.admin as admin_mod
    monkeypatch.setattr(notify, "get_notify_config",
                        lambda: {"tg_token": "T", "tg_chat": "", "vk_token": "", "vk_peer": ""})
    monkeypatch.setattr(admin_mod.httpx, "get",
                        lambda *a, **k: _FakeResp({"ok": True, "result": {"username": "myshop_bot"}}))
    d = client.get("/api/v1/admin/telegram/status", headers=_auth(token)).json()
    assert d["token_present"] is True and d["bot_username"] == "myshop_bot"


def test_telegram_connect_detects_chat(client, token, db_session, monkeypatch):
    import app.integrations.notify as notify
    import app.api.v1.endpoints.admin as admin_mod
    from app.db.models.admin import ShopSettings
    monkeypatch.setattr(notify, "get_notify_config",
                        lambda: {"tg_token": "T", "tg_chat": "", "vk_token": "", "vk_peer": ""})
    monkeypatch.setattr(admin_mod.httpx, "get",
                        lambda *a, **k: _FakeResp({"ok": True, "result": [{"message": {"chat": {"id": 555, "first_name": "Оля"}}}]}))
    d = client.post("/api/v1/admin/telegram/connect", headers=_auth(token)).json()
    assert d["chat_id"] == "555" and d["chat_title"] == "Оля"
    db_session.expire_all()
    assert db_session.get(ShopSettings, "telegram_chat_id").value == "555"


def test_telegram_connect_no_messages(client, token, monkeypatch):
    import app.integrations.notify as notify
    import app.api.v1.endpoints.admin as admin_mod
    monkeypatch.setattr(notify, "get_notify_config",
                        lambda: {"tg_token": "T", "tg_chat": "", "vk_token": "", "vk_peer": ""})
    monkeypatch.setattr(admin_mod.httpx, "get",
                        lambda *a, **k: _FakeResp({"ok": True, "result": []}))
    resp = client.post("/api/v1/admin/telegram/connect", headers=_auth(token))
    assert resp.status_code == 404


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

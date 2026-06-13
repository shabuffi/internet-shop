"""Тесты авторизации админки: httpOnly-кука, /me, logout, хеширование пароля обмена."""

from app.db.models.admin import AdminUser, ShopSettings
from app.api.v1.endpoints.admin import _hash_password


def _make_admin(db, username="admin", password="password123"):
    db.add(AdminUser(username=username, password_hash=_hash_password(password)))
    db.commit()


def test_login_sets_httponly_cookie(client, db_session):
    _make_admin(db_session)
    r = client.post("/api/v1/admin/login", json={"username": "admin", "password": "password123"})
    assert r.status_code == 200
    # кука установлена...
    assert "admin_token" in r.cookies
    # ...и она httpOnly (недоступна JS)
    set_cookie = r.headers.get("set-cookie", "")
    assert "httponly" in set_cookie.lower()


def test_me_works_via_cookie(client, db_session):
    """После логина /me доступен без заголовка Authorization — только по куке."""
    _make_admin(db_session)
    client.post("/api/v1/admin/login", json={"username": "admin", "password": "password123"})
    r = client.get("/api/v1/admin/me")
    assert r.status_code == 200
    assert r.json()["username"] == "admin"


def test_me_without_auth_401(client):
    assert client.get("/api/v1/admin/me").status_code == 401


def test_login_wrong_password_401(client, db_session):
    _make_admin(db_session)
    r = client.post("/api/v1/admin/login", json={"username": "admin", "password": "WRONG"})
    assert r.status_code == 401


def test_logout_clears_cookie(client, db_session):
    _make_admin(db_session)
    client.post("/api/v1/admin/login", json={"username": "admin", "password": "password123"})
    client.post("/api/v1/admin/logout")
    # после выхода кука сброшена → /me снова 401
    assert client.get("/api/v1/admin/me").status_code == 401


# ─── Страница «Разработчик» (отдельный пароль) ───────────────────────────────

def _dev_login(client, monkeypatch, password="devpass"):
    from app.api.v1.endpoints import admin as admin_mod
    monkeypatch.setattr(admin_mod.settings, "DEV_PASSWORD", password)
    return client.post("/api/v1/admin/dev/login", json={"password": password})


def test_dev_status_reflects_password(client, monkeypatch):
    from app.api.v1.endpoints import admin as admin_mod
    monkeypatch.setattr(admin_mod.settings, "DEV_PASSWORD", "")
    assert client.get("/api/v1/admin/dev/status").json()["enabled"] is False
    monkeypatch.setattr(admin_mod.settings, "DEV_PASSWORD", "devpass")
    assert client.get("/api/v1/admin/dev/status").json()["enabled"] is True


def test_dev_login_wrong_password_401(client, monkeypatch):
    from app.api.v1.endpoints import admin as admin_mod
    monkeypatch.setattr(admin_mod.settings, "DEV_PASSWORD", "devpass")
    assert client.post("/api/v1/admin/dev/login", json={"password": "WRONG"}).status_code == 401


def test_dev_login_disabled_when_no_password(client, monkeypatch):
    from app.api.v1.endpoints import admin as admin_mod
    monkeypatch.setattr(admin_mod.settings, "DEV_PASSWORD", "")
    assert client.post("/api/v1/admin/dev/login", json={"password": "x"}).status_code == 403


def test_dev_settings_requires_auth(client):
    assert client.get("/api/v1/admin/dev/settings").status_code == 401


def test_owner_settings_hashes_exchange_password(client, db_session):
    """exchange_password (обмен МойСклад) задаётся владельцем и хранится как bcrypt-хеш."""
    _make_admin(db_session)
    client.post("/api/v1/admin/login", json={"username": "admin", "password": "password123"})
    client.post("/api/v1/admin/settings", json={"exchange_password": "secret123"})

    row = db_session.get(ShopSettings, "exchange_password")
    assert row is not None
    assert row.value != "secret123"        # не открытый текст
    assert row.value.startswith("$2")      # признак bcrypt-хеша


def test_owner_settings_saves_vk_peer_and_email(client, db_session):
    """Владелец вводит свой id ВК и email; они сохраняются."""
    _make_admin(db_session)
    client.post("/api/v1/admin/login", json={"username": "admin", "password": "password123"})
    client.post("/api/v1/admin/settings", json={"vk_peer_id": "555", "notify_email": "o@mail.ru"})
    assert db_session.get(ShopSettings, "vk_peer_id").value == "555"
    assert db_session.get(ShopSettings, "notify_email").value == "o@mail.ru"


def test_dev_settings_saves_vk_token(client, db_session, monkeypatch):
    """Разработчик задаёт ключ сообщества ВК (peer_id — у владельца)."""
    _dev_login(client, monkeypatch)
    client.post("/api/v1/admin/dev/settings", json={"vk_group_token": "vk1.a.X"})
    assert db_session.get(ShopSettings, "vk_group_token").value == "vk1.a.X"


def test_dev_wipe_catalog_requires_auth(client):
    assert client.delete("/api/v1/admin/dev/catalog").status_code == 401


def test_dev_wipe_catalog(client, db_session, monkeypatch):
    from decimal import Decimal
    from app.db.models.product import Product, Category
    _dev_login(client, monkeypatch)
    db_session.add(Category(id="c1", moysklad_id="mc1", name="Кат"))
    db_session.add(Product(id="w1", moysklad_id="mw1", name="Т", price=Decimal("1"), stock=0, category_id="c1"))
    db_session.commit()

    r = client.delete("/api/v1/admin/dev/catalog")
    assert r.status_code == 200 and r.json()["products"] == 1
    db_session.expire_all()
    assert db_session.query(Product).count() == 0
    assert db_session.query(Category).count() == 0


def test_dev_wipe_catalog_keeps_orders(client, db_session, monkeypatch):
    """Очистка каталога не удаляет заказы (снимок имени/артикула в позиции остаётся)."""
    from decimal import Decimal
    from app.db.models.product import Product
    from app.db.models.order import Order, OrderItem
    _dev_login(client, monkeypatch)
    db_session.add(Product(id="w2", moysklad_id="mw2", name="Т", price=Decimal("10"), stock=0))
    db_session.add(Order(id="ow", number="ORD-W", customer_name="И", customer_phone="+79001234567",
                         total_amount=Decimal("10"), status="new",
                         items=[OrderItem(product_id="w2", product_name="Т", price=Decimal("10"), quantity=1)]))
    db_session.commit()

    client.delete("/api/v1/admin/dev/catalog")
    db_session.expire_all()
    assert db_session.query(Product).count() == 0
    assert db_session.get(Order, "ow") is not None   # заказ сохранился


def test_change_password_success(client, db_session):
    _make_admin(db_session, password="oldpass123")
    client.post("/api/v1/admin/login", json={"username": "admin", "password": "oldpass123"})
    r = client.post("/api/v1/admin/change-password",
                    json={"current_password": "oldpass123", "new_password": "newpass456"})
    assert r.status_code == 200
    # старый пароль больше не работает, новый — да
    client.post("/api/v1/admin/logout")
    assert client.post("/api/v1/admin/login", json={"username": "admin", "password": "oldpass123"}).status_code == 401
    assert client.post("/api/v1/admin/login", json={"username": "admin", "password": "newpass456"}).status_code == 200


def test_change_password_wrong_current(client, db_session):
    _make_admin(db_session, password="oldpass123")
    client.post("/api/v1/admin/login", json={"username": "admin", "password": "oldpass123"})
    r = client.post("/api/v1/admin/change-password",
                    json={"current_password": "WRONG", "new_password": "newpass456"})
    assert r.status_code == 401


def test_change_password_too_short(client, db_session):
    _make_admin(db_session, password="oldpass123")
    client.post("/api/v1/admin/login", json={"username": "admin", "password": "oldpass123"})
    r = client.post("/api/v1/admin/change-password",
                    json={"current_password": "oldpass123", "new_password": "short"})
    assert r.status_code == 422


def test_change_password_requires_auth(client):
    r = client.post("/api/v1/admin/change-password",
                    json={"current_password": "x", "new_password": "newpass456"})
    assert r.status_code == 401

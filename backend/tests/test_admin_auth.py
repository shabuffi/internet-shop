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


def test_settings_hashes_exchange_password(client, db_session):
    """exchange_password сохраняется в БД как bcrypt-хеш, не открытым текстом."""
    _make_admin(db_session)
    client.post("/api/v1/admin/login", json={"username": "admin", "password": "password123"})
    client.post("/api/v1/admin/settings", json={"exchange_password": "secret123"})

    row = db_session.get(ShopSettings, "exchange_password")
    assert row is not None
    assert row.value != "secret123"        # не открытый текст
    assert row.value.startswith("$2")      # признак bcrypt-хеша


def test_settings_moysklad_password_stays_plaintext(client, db_session):
    """moysklad_password — исходящий секрет, хранится открытым (нужен для запросов к МойСклад)."""
    _make_admin(db_session)
    client.post("/api/v1/admin/login", json={"username": "admin", "password": "password123"})
    client.post("/api/v1/admin/settings", json={"moysklad_password": "ms-secret"})

    row = db_session.get(ShopSettings, "moysklad_password")
    assert row.value == "ms-secret"

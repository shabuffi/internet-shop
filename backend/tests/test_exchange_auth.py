"""Тесты аутентификации обмена CommerceML (мягкий режим, Basic Auth, кука сессии)."""

import base64

from app.api.v1.endpoints import exchange
from app.api.v1.endpoints.admin import _hash_password
from app.db.models.admin import ShopSettings


class FakeRequest:
    """Минимальная заглушка Request: только headers и cookies."""
    def __init__(self, headers=None, cookies=None):
        self.headers = headers or {}
        self.cookies = cookies or {}


def _basic(login, password):
    token = base64.b64encode(f"{login}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def _set_exchange_creds(db, login="u", password="p"):
    # пароль обмена хранится как bcrypt-хеш (как и делает save_settings)
    db.add(ShopSettings(key="exchange_login", value=login))
    db.add(ShopSettings(key="exchange_password", value=_hash_password(password)))
    db.commit()


# ─── _basic_auth_ok (чистая функция; exp_pass — bcrypt-хеш) ──────────────────

def test_basic_auth_correct():
    pw_hash = _hash_password("p")
    assert exchange._basic_auth_ok(FakeRequest(headers=_basic("u", "p")), "u", pw_hash) is True


def test_basic_auth_wrong_password():
    pw_hash = _hash_password("p")
    assert exchange._basic_auth_ok(FakeRequest(headers=_basic("u", "WRONG")), "u", pw_hash) is False


def test_basic_auth_no_header():
    assert exchange._basic_auth_ok(FakeRequest(), "u", _hash_password("p")) is False


def test_basic_auth_empty_expected_never_valid():
    """Пустые ожидаемые креды не должны проходить даже при пустом вводе."""
    assert exchange._basic_auth_ok(FakeRequest(headers=_basic("", "")), "", "") is False


def test_basic_auth_malformed_header():
    assert exchange._basic_auth_ok(FakeRequest(headers={"Authorization": "Basic не-base64"}), "u", _hash_password("p")) is False


# ─── _is_authorized (БД + Redis) ─────────────────────────────────────────────

def test_is_authorized_fail_closed_when_no_creds(db_session):
    """Креды обмена не заданы → fail-closed → доступ закрыт (никого не пускаем).

    Раньше это был «мягкий режим» (пускали всех) — небезопасный дефолт, устранён в Stage 1
    (см. docs/security/DECISIONS.md).
    """
    assert exchange._is_authorized(FakeRequest(), db_session) is False


def test_is_authorized_valid_basic(db_session):
    _set_exchange_creds(db_session)
    assert exchange._is_authorized(FakeRequest(headers=_basic("u", "p")), db_session) is True


def test_is_authorized_rejects_without_auth(db_session):
    _set_exchange_creds(db_session)
    assert exchange._is_authorized(FakeRequest(), db_session) is False


def test_is_authorized_valid_session_cookie(db_session, monkeypatch):
    """Кука с токеном, который лежит в Redis, проходит."""
    _set_exchange_creds(db_session)

    class FakeRedis:
        def get(self, key):
            return b"tok-123"

    monkeypatch.setattr(exchange, "redis_client", FakeRedis())
    req = FakeRequest(cookies={"session": "tok-123"})
    assert exchange._is_authorized(req, db_session) is True


def test_is_authorized_wrong_cookie(db_session, monkeypatch):
    _set_exchange_creds(db_session)

    class FakeRedis:
        def get(self, key):
            return b"real-token"

    monkeypatch.setattr(exchange, "redis_client", FakeRedis())
    req = FakeRequest(cookies={"session": "guessed-token"})
    assert exchange._is_authorized(req, db_session) is False

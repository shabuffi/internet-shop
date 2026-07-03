"""Тесты авторизации ПОКУПАТЕЛЯ: регистрация (активация/ext_code), вход, смена пароля.

Rate-limit ходит в реальный Redis, а TestClient всегда с одного IP — поэтому в
потоковых тестах его отключаем monkeypatch'ем (autouse), а поведение лимита
проверяем отдельным юнит-тестом хелпера.
"""

import uuid

import pytest
from sqlalchemy import select

from app.db.models.user import User
from app.api.v1.endpoints.auth import _hash_password

# Валидная регистрация (Яндекс-почта, надёжный пароль, согласие).
VALID = dict(
    email="buyer@yandex.ru", phone="+79001234567", customer_type="individual",
    customer_name="Иван Иванов", password="Parol123", consent=True,
)


@pytest.fixture(autouse=True)
def _no_rate_limit(monkeypatch):
    """Отключаем rate-limit в HTTP-тестах (иначе TestClient упрётся в лимит по IP)."""
    from app.api.v1.endpoints import auth as auth_mod
    monkeypatch.setattr(auth_mod, "rate_limit", lambda *a, **k: None)


def _make_user(db, password="Parol123", **kw):
    defaults = dict(
        email="old@yandex.ru", phone="+79001112233", customer_type="individual",
        customer_name="Старый Клиент", password_hash=_hash_password(password), is_active=True,
    )
    defaults.update(kw)
    u = User(**defaults)
    db.add(u)
    db.commit()
    return u


# ─── регистрация ─────────────────────────────────────────────────────────────

def test_register_creates_inactive_with_ext_code(client, db_session):
    r = client.post("/api/v1/auth/register", json=VALID)
    assert r.status_code == 201
    assert r.json()["is_active"] is False           # новый аккаунт ждёт активации
    u = db_session.scalar(select(User).where(User.email == "buyer@yandex.ru"))
    assert u is not None and u.is_active is False
    assert u.moysklad_ext_code and len(u.moysklad_ext_code) == 16   # сгенерён «Внешний код»


def test_register_rejects_google_email(client):
    r = client.post("/api/v1/auth/register", json={**VALID, "email": "buyer@gmail.com"})
    assert r.status_code == 422


def test_register_rejects_weak_password(client):
    r = client.post("/api/v1/auth/register", json={**VALID, "password": "weak"})
    assert r.status_code == 422


def test_register_duplicate_email_409(client, db_session):
    client.post("/api/v1/auth/register", json=VALID)
    r = client.post("/api/v1/auth/register", json=VALID)
    assert r.status_code == 409


def test_register_duplicate_phone_409(client, db_session):
    client.post("/api/v1/auth/register", json=VALID)
    # другой email, тот же телефон → отклоняем
    r = client.post("/api/v1/auth/register", json={**VALID, "email": "other@yandex.ru"})
    assert r.status_code == 409


# ─── вход (существующие клиенты не должны потерять доступ) ────────────────────

def test_login_existing_weak_password_works(client, db_session):
    """Ключевое: у входа НЕТ проверки надёжности — старый слабый пароль работает."""
    _make_user(db_session, password="weakpass")     # слабый, но уже существует
    r = client.post("/api/v1/auth/login", json={"email": "old@yandex.ru", "password": "weakpass"})
    assert r.status_code == 200


def test_login_wrong_password_401(client, db_session):
    _make_user(db_session, password="Parol123")
    r = client.post("/api/v1/auth/login", json={"email": "old@yandex.ru", "password": "nope"})
    assert r.status_code == 401


# ─── смена пароля в ЛК ───────────────────────────────────────────────────────

def test_change_password_success(client, db_session):
    client.post("/api/v1/auth/register", json=VALID)   # ставит куку (pw Parol123)
    r = client.post("/api/v1/auth/change-password",
                    json={"current_password": "Parol123", "new_password": "Novyj456"})
    assert r.status_code == 200
    # старый пароль больше не подходит, новый — да
    client.post("/api/v1/auth/logout")
    assert client.post("/api/v1/auth/login", json={"email": VALID["email"], "password": "Parol123"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": VALID["email"], "password": "Novyj456"}).status_code == 200


def test_change_password_wrong_current_400(client, db_session):
    client.post("/api/v1/auth/register", json=VALID)
    r = client.post("/api/v1/auth/change-password",
                    json={"current_password": "WRONG999", "new_password": "Novyj456"})
    assert r.status_code == 400


def test_change_password_weak_new_422(client, db_session):
    client.post("/api/v1/auth/register", json=VALID)
    r = client.post("/api/v1/auth/change-password",
                    json={"current_password": "Parol123", "new_password": "weak"})
    assert r.status_code == 422


def test_change_password_requires_auth_401(client):
    r = client.post("/api/v1/auth/change-password",
                    json={"current_password": "Parol123", "new_password": "Novyj456"})
    assert r.status_code == 401


# ─── rate-limit (юнит-тест хелпера, реальный Redis) ──────────────────────────

def test_rate_limit_blocks_after_limit():
    from fastapi import HTTPException
    from app.core.rate_limit import rate_limit
    from app.core.redis_client import redis_client
    try:
        redis_client.ping()
    except Exception:
        pytest.skip("Redis недоступен")

    key = f"rl:test:{uuid.uuid4().hex}"
    redis_client.delete(key)
    try:
        for _ in range(3):
            rate_limit(key, limit=3, window_sec=60)     # первые 3 — ок
        with pytest.raises(HTTPException) as exc:
            rate_limit(key, limit=3, window_sec=60)     # 4-я — блок
        assert exc.value.status_code == 429
    finally:
        redis_client.delete(key)

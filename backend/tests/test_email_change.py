"""Безопасная смена email покупателя: заявка → письмо на новый адрес → подтверждение.

Ключевые инварианты, ради которых всё и сделано:
* до подтверждения логин НЕ меняется (вход по старому адресу работает, по новому — нет);
* заявка требует текущий пароль (иначе украденной куки хватило бы для захвата аккаунта);
* занятый адрес даёт понятный 409 — и на заявке, и в момент подтверждения (никаких 500);
* ссылка одноразовая (после подтверждения/отмены заявки её нет — токен мёртв).
"""

import pytest
from sqlalchemy import select

from app.db.models.user import User
from app.api.v1.endpoints.auth import _create_email_change_token, _hash_password

VALID = dict(
    email="buyer@yandex.ru", phone="+79001234567", customer_type="individual",
    customer_name="Иван Иванов", password="Parol123", consent=True,
)
NEW_EMAIL = "buyer.new@yandex.ru"


@pytest.fixture(autouse=True)
def _no_rate_limit(monkeypatch):
    """Отключаем rate-limit в HTTP-тестах (TestClient всегда с одного IP)."""
    from app.api.v1.endpoints import auth as auth_mod
    monkeypatch.setattr(auth_mod, "rate_limit", lambda *a, **k: None)


def _register(client) -> None:
    """Регистрирует покупателя из VALID и оставляет клиента авторизованным (кука)."""
    assert client.post("/api/v1/auth/register", json=VALID).status_code == 201


def _request_change(client, email=NEW_EMAIL, password="Parol123"):
    return client.post("/api/v1/auth/change-email",
                       json={"new_email": email, "current_password": password})


def _token_for(db_session, email=VALID["email"]) -> str:
    user = db_session.scalar(select(User).where(User.email == email))
    return _create_email_change_token(user)


# ─── заявка на смену ─────────────────────────────────────────────────────────

def test_change_email_requires_auth_401(client):
    r = _request_change(client)
    assert r.status_code == 401


def test_change_email_wrong_password_400(client, db_session):
    _register(client)
    r = _request_change(client, password="WRONG999")
    assert r.status_code == 400
    assert "пароль" in r.json()["detail"].lower()
    user = db_session.scalar(select(User).where(User.email == VALID["email"]))
    assert user.pending_email is None       # заявка не создана


def test_change_email_same_address_400(client):
    _register(client)
    r = _request_change(client, email=VALID["email"])
    assert r.status_code == 400
    assert "текущий email" in r.json()["detail"]


def test_change_email_taken_409_not_500(client, db_session):
    """Адрес занят другим аккаунтом → 409 с понятным текстом (а не 500 от unique-индекса)."""
    db_session.add(User(
        email=NEW_EMAIL, phone="+79005554433", customer_type="individual",
        customer_name="Другой Клиент", password_hash=_hash_password("Parol123"), is_active=True))
    db_session.commit()
    _register(client)
    r = _request_change(client)
    assert r.status_code == 409
    assert "занят" in r.json()["detail"]


def test_change_email_invalid_format_422(client):
    _register(client)
    r = _request_change(client, email="не-адрес")
    assert r.status_code == 422
    assert "new_email" in [e["loc"][-1] for e in r.json()["detail"]]


def test_request_does_not_change_login_yet(client, db_session):
    """До подтверждения email остаётся прежним: вход по старому работает, по новому — нет."""
    _register(client)
    assert _request_change(client).status_code == 200

    user = db_session.scalar(select(User).where(User.email == VALID["email"]))
    assert user.pending_email == NEW_EMAIL and user.pending_email_at is not None

    client.post("/api/v1/auth/logout")
    assert client.post("/api/v1/auth/login",
                       json={"email": NEW_EMAIL, "password": "Parol123"}).status_code == 401
    assert client.post("/api/v1/auth/login",
                       json={"email": VALID["email"], "password": "Parol123"}).status_code == 200


def test_me_exposes_pending_email(client):
    _register(client)
    _request_change(client)
    assert client.get("/api/v1/auth/me").json()["pending_email"] == NEW_EMAIL


# ─── подтверждение ───────────────────────────────────────────────────────────

def test_confirm_changes_login(client, db_session):
    _register(client)
    _request_change(client)
    token = _token_for(db_session)

    r = client.post("/api/v1/auth/change-email/confirm", json={"token": token})
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == NEW_EMAIL and body["pending_email"] is None

    client.post("/api/v1/auth/logout")
    assert client.post("/api/v1/auth/login",
                       json={"email": NEW_EMAIL, "password": "Parol123"}).status_code == 200
    assert client.post("/api/v1/auth/login",
                       json={"email": VALID["email"], "password": "Parol123"}).status_code == 401


def test_confirm_keeps_user_id_and_ext_code(client, db_session):
    """Смена логина не трогает ни id, ни «Внешний код» МойСклад — заказы и связь целы."""
    _register(client)
    before = db_session.scalar(select(User).where(User.email == VALID["email"]))
    user_id, ext_code = before.id, before.moysklad_ext_code

    _request_change(client)
    client.post("/api/v1/auth/change-email/confirm", json={"token": _token_for(db_session)})

    after = db_session.scalar(select(User).where(User.email == NEW_EMAIL))
    assert after.id == user_id and after.moysklad_ext_code == ext_code


def test_confirm_link_is_single_use(client, db_session):
    _register(client)
    _request_change(client)
    token = _token_for(db_session)
    assert client.post("/api/v1/auth/change-email/confirm", json={"token": token}).status_code == 200
    r2 = client.post("/api/v1/auth/change-email/confirm", json={"token": token})
    assert r2.status_code == 400


def test_confirm_invalid_token_400(client):
    r = client.post("/api/v1/auth/change-email/confirm", json={"token": "garbage.token.here"})
    assert r.status_code == 400


def test_reset_password_token_not_accepted_as_email_token(client, db_session):
    """Чужой тип токена (сброс пароля) не должен проходить как подтверждение email."""
    from app.api.v1.endpoints.auth import _create_reset_token
    _register(client)
    _request_change(client)
    user = db_session.scalar(select(User).where(User.email == VALID["email"]))
    r = client.post("/api/v1/auth/change-email/confirm", json={"token": _create_reset_token(user)})
    assert r.status_code == 400


def test_confirm_when_address_taken_meanwhile_409(client, db_session):
    """Между заявкой и подтверждением адрес занял другой покупатель → 409, заявка снимается."""
    _register(client)
    _request_change(client)
    token = _token_for(db_session)

    db_session.add(User(
        email=NEW_EMAIL, phone="+79005554433", customer_type="individual",
        customer_name="Успел Первым", password_hash=_hash_password("Parol123"), is_active=True))
    db_session.commit()

    r = client.post("/api/v1/auth/change-email/confirm", json={"token": token})
    assert r.status_code == 409
    assert "занят" in r.json()["detail"]

    user = db_session.scalar(select(User).where(User.email == VALID["email"]))
    assert user.email == VALID["email"] and user.pending_email is None


def test_new_request_kills_old_link(client, db_session):
    """Вторая заявка обесценивает ссылку из первого письма."""
    _register(client)
    _request_change(client)
    old_token = _token_for(db_session)
    _request_change(client, email="third@yandex.ru")

    assert client.post("/api/v1/auth/change-email/confirm",
                       json={"token": old_token}).status_code == 400


# ─── отмена ──────────────────────────────────────────────────────────────────

def test_cancel_clears_pending_and_kills_link(client, db_session):
    _register(client)
    _request_change(client)
    token = _token_for(db_session)

    r = client.post("/api/v1/auth/change-email/cancel")
    assert r.status_code == 200 and r.json()["pending_email"] is None
    assert client.post("/api/v1/auth/change-email/confirm",
                       json={"token": token}).status_code == 400


def test_cancel_requires_auth_401(client):
    assert client.post("/api/v1/auth/change-email/cancel").status_code == 401


# ─── подсказка об опечатке ───────────────────────────────────────────────────

def test_check_email_suggests_fix(client):
    r = client.post("/api/v1/auth/check-email", json={"email": "ivan@gmial.com"})
    assert r.status_code == 200 and r.json()["suggestion"] == "ivan@gmail.com"


def test_check_email_silent_on_valid_domain(client):
    r = client.post("/api/v1/auth/check-email", json={"email": "ivan@yandex.ru"})
    assert r.status_code == 200 and r.json()["suggestion"] is None


def test_register_with_typo_is_not_blocked(client):
    """Опечатка — только предупреждение: регистрация с таким адресом обязана проходить."""
    r = client.post("/api/v1/auth/register", json={**VALID, "email": "ivan@gmial.com"})
    assert r.status_code == 201

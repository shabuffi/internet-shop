"""Тесты админ-раздела «Покупатели»: активация аккаунтов, привязка контрагента,
частичное обновление, и фильтры истории заказов (по user_id / по телефону)."""

from decimal import Decimal

import pytest

from app.db.models.admin import AdminUser
from app.db.models.user import User
from app.db.models.order import Order
from app.api.v1.endpoints.admin import _create_token, _hash_password


@pytest.fixture
def token(db_session):
    db_session.add(AdminUser(username="admin", password_hash=_hash_password("password123")))
    db_session.commit()
    return _create_token("admin")


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_user(db, **kw):
    defaults = dict(
        email="c@yandex.ru", phone="+79001234567", customer_type="individual",
        customer_name="Клиент", password_hash=_hash_password("Parol123"),
        is_active=False, moysklad_ext_code="gen123",
    )
    defaults.update(kw)
    u = User(**defaults)
    db.add(u)
    db.commit()
    return u


def _make_order(db, oid, phone, number, user_id=None):
    o = Order(id=oid, number=number, customer_name="X", customer_phone=phone,
              total_amount=Decimal("10"), status="new", user_id=user_id)
    db.add(o)
    db.commit()
    return o


# ─── активация / привязка контрагента ────────────────────────────────────────

def test_list_users_has_activation_fields(client, token, db_session):
    _make_user(db_session)
    r = client.get("/api/v1/admin/users", headers=_auth(token))
    assert r.status_code == 200
    u = r.json()[0]
    assert u["is_active"] is False
    assert u["moysklad_ext_code"] == "gen123"


def test_activate_as_new(client, token, db_session):
    u = _make_user(db_session)
    r = client.patch(f"/api/v1/admin/users/{u.id}", json={"is_active": True}, headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["is_active"] is True


def test_activate_as_existing_sets_code(client, token, db_session):
    u = _make_user(db_session)
    r = client.patch(f"/api/v1/admin/users/{u.id}",
                     json={"is_active": True, "moysklad_ext_code": "EXT-777"}, headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert body["is_active"] is True
    assert body["moysklad_ext_code"] == "EXT-777"


def test_patch_discount_only_keeps_activation(client, token, db_session):
    """Частичный PATCH скидки не сбрасывает is_active/код (обновляются только переданные поля)."""
    u = _make_user(db_session, is_active=True, moysklad_ext_code="KEEP")
    r = client.patch(f"/api/v1/admin/users/{u.id}", json={"discount_percent": -5}, headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    assert body["is_active"] is True
    assert body["moysklad_ext_code"] == "KEEP"


def test_patch_discount_out_of_range_422(client, token, db_session):
    u = _make_user(db_session)
    r = client.patch(f"/api/v1/admin/users/{u.id}", json={"discount_percent": 50}, headers=_auth(token))
    assert r.status_code == 422


def test_patch_user_requires_auth_401(client, db_session):
    u = _make_user(db_session)
    r = client.patch(f"/api/v1/admin/users/{u.id}", json={"is_active": True})
    assert r.status_code == 401


def test_set_duplicate_ext_code_409(client, token, db_session):
    _make_user(db_session, email="a@ya.ru", phone="+79001110000", moysklad_ext_code="SAME")
    u2 = _make_user(db_session, email="b@ya.ru", phone="+79002220000", moysklad_ext_code="OTHER")
    # попытка поставить второму тот же код, что у первого → 409
    r = client.patch(f"/api/v1/admin/users/{u2.id}",
                     json={"moysklad_ext_code": "SAME"}, headers=_auth(token))
    assert r.status_code == 409
    # свой же код у себя менять можно (не считаем дублем)
    ok = client.patch(f"/api/v1/admin/users/{u2.id}",
                      json={"moysklad_ext_code": "OTHER"}, headers=_auth(token))
    assert ok.status_code == 200


# ─── история заказов по клиенту (фильтры user_id / phone + is_guest) ─────────

def test_orders_filter_by_user_id(client, token, db_session):
    u = _make_user(db_session)
    _make_order(db_session, "o1", "+79001110000", "U-1", user_id=u.id)
    _make_order(db_session, "o2", "+79002220000", "G-1", user_id=None)
    r = client.get(f"/api/v1/admin/orders?user_id={u.id}", headers=_auth(token))
    assert r.status_code == 200
    items = r.json()["items"]
    assert [i["number"] for i in items] == ["U-1"]
    assert items[0]["is_guest"] is False


def test_orders_filter_by_phone_guest(client, token, db_session):
    _make_order(db_session, "o3", "+79003330000", "G-2", user_id=None)
    _make_order(db_session, "o4", "+79004440000", "G-3", user_id=None)
    r = client.get("/api/v1/admin/orders", params={"phone": "+79003330000"}, headers=_auth(token))
    items = r.json()["items"]
    assert [i["number"] for i in items] == ["G-2"]
    assert items[0]["is_guest"] is True


def test_orders_unfiltered_has_is_guest_flag(client, token, db_session):
    _make_order(db_session, "o5", "+79005550000", "G-4", user_id=None)
    r = client.get("/api/v1/admin/orders", headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["items"][0]["is_guest"] is True


def test_orders_filter_requires_auth_401(client):
    assert client.get("/api/v1/admin/orders").status_code == 401

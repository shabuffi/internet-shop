"""Контракт выдачи времени наружу: таймстампы из БД (наивный UTC) уходят в API с
явным смещением UTC (``+00:00``), чтобы клиент не трактовал их как локальное время.

Хранение остаётся UTC — здесь проверяется ТОЛЬКО сериализация на границе API.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.api.v1.endpoints.admin import _create_token, _hash_password
from app.core.timeutil import ensure_utc, iso_utc
from app.db.models.admin import AdminUser
from app.db.models.order import Order, OrderItem
from app.db.models.product import Product
from app.schemas.order import OrderOut


@pytest.fixture
def token(db_session):
    db_session.add(AdminUser(username="admin", password_hash=_hash_password("password123")))
    db_session.commit()
    return _create_token("admin")


# ─── helpers ─────────────────────────────────────────────────────────────────

def test_ensure_utc_treats_naive_as_utc():
    naive = datetime(2026, 6, 8, 12, 0, 0)
    aware = ensure_utc(naive)
    assert aware.tzinfo is timezone.utc
    assert aware.hour == 12                       # момент не сдвинут, только проставлена зона


def test_ensure_utc_converts_aware_to_utc():
    msk = datetime(2026, 6, 8, 15, 0, 0, tzinfo=timezone(timedelta(hours=3)))
    assert ensure_utc(msk).hour == 12             # 15:00 +03:00 → 12:00 UTC


def test_iso_utc_appends_offset_and_handles_none():
    assert iso_utc(datetime(2026, 6, 8, 12, 0, 0)) == "2026-06-08T12:00:00+00:00"
    assert iso_utc(None) is None


# ─── Pydantic-схема ──────────────────────────────────────────────────────────

def test_order_out_serializes_created_at_with_utc_offset():
    """OrderOut.created_at (наивный UTC из БД) → JSON c ``+00:00`` (а не голый ISO)."""
    order = Order(
        id="o", number="ORD-1", customer_name="Иван", customer_phone="+79001234567",
        total_amount=Decimal("20"), status="new",
        created_at=datetime(2026, 6, 8, 12, 0, 0),
        items=[OrderItem(product_id="p", product_name="Т", price=Decimal("10"), quantity=2)],
    )
    dumped = OrderOut.model_validate(order).model_dump(mode="json")
    assert dumped["created_at"] == "2026-06-08T12:00:00+00:00"


# ─── эндпоинт админки ────────────────────────────────────────────────────────

def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_admin_orders_created_at_carries_utc_offset(client, token, db_session):
    """Список заказов админки: created_at/exported_at отдаются с явной зоной UTC."""
    db_session.add(Product(id="tp", moysklad_id="ms-tp", name="Т", article="A",
                           price=Decimal("10"), stock=5))
    db_session.add(Order(id="to", number="ORD-TZ", customer_name="Иван",
                         customer_phone="+79001234567", total_amount=Decimal("20"), status="new",
                         exported_at=datetime(2026, 1, 1, 9, 30, 0),
                         items=[OrderItem(product_id="tp", product_name="Т", price=Decimal("10"), quantity=1)]))
    db_session.commit()

    row = client.get("/api/v1/admin/orders", headers=_auth(token)).json()["items"][0]
    assert row["created_at"].endswith("+00:00")
    assert row["exported_at"] == "2026-01-01T09:30:00+00:00"

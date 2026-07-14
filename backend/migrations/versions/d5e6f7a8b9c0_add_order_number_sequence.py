"""add order_number_seq sequence for race-free order numbers

Revision ID: d5e6f7a8b9c0
Revises: 1567fb6768ce
Create Date: 2026-07-14

Заменяет генерацию номера заказа по COUNT(*)+1 (race condition при нескольких воркерах)
на атомарный Postgres-sequence. Значение стартует после максимального существующего
номера, чтобы не пересечься с уже созданными заказами.
"""
from alembic import op
import sqlalchemy as sa

revision = "d5e6f7a8b9c0"
down_revision = "1567fb6768ce"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SEQUENCE IF NOT EXISTS order_number_seq")
    conn = op.get_bind()
    # Максимальный числовой суффикс среди существующих номеров ORD-XXXX (0, если заказов нет)
    maxnum = conn.execute(sa.text(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(number FROM '[0-9]+$') AS INTEGER)), 0) FROM orders"
    )).scalar() or 0
    if int(maxnum) > 0:
        # is_called=true → следующий nextval вернёт maxnum+1 (не пересечётся с существующими).
        conn.execute(sa.text("SELECT setval('order_number_seq', :v, true)"), {"v": int(maxnum)})


def downgrade() -> None:
    op.execute("DROP SEQUENCE IF EXISTS order_number_seq")

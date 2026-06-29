"""add exported_at to orders

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-08

Отметка времени выгрузки заказа в МойСклад через обмен CommerceML (МойСклад сам
забирает заказы). NULL — заказ ещё не выгружен.
"""
from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("exported_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "exported_at")

"""add order moysklad_status / moysklad_number

Статус заказа из МойСклад приходит обратно в orders.xml (реквизит «Статус заказа»).
Храним его как свободный текст, плюс внутренний номер МойСклад («Номер по 1С»).

Revision ID: c1d2e3f4a5b6
Revises: 9f3e7a1c2b48
Create Date: 2026-07-03
"""
from alembic import op
import sqlalchemy as sa

revision = "c1d2e3f4a5b6"
down_revision = "9f3e7a1c2b48"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("moysklad_status", sa.String(length=100), nullable=True))
    op.add_column("orders", sa.Column("moysklad_number", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "moysklad_number")
    op.drop_column("orders", "moysklad_status")

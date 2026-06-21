"""add attributes (json) to products

Revision ID: c9d0e1f2a3b4
Revises: 8206346ba840
Create Date: 2026-06-21

Характеристики товара из МойСклад: список {"name", "value"} (реквизиты, кроме технических).
"""
from alembic import op
import sqlalchemy as sa

revision = "c9d0e1f2a3b4"
down_revision = "8206346ba840"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("attributes", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "attributes")

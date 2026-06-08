"""drop moysklad_rest_id from products

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-08

REST-id товара больше не нужен: интеграция переведена на чистый CommerceML, заказы
сопоставляются по moysklad_id (Ид каталога), REST API не используется.
"""
from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_products_moysklad_rest_id", table_name="products")
    op.drop_column("products", "moysklad_rest_id")


def downgrade() -> None:
    op.add_column("products", sa.Column("moysklad_rest_id", sa.String(length=36), nullable=True))
    op.create_index("ix_products_moysklad_rest_id", "products", ["moysklad_rest_id"])

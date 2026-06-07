"""add moysklad_rest_id to products

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-07

REST id товара в МойСклад (отличается от moysklad_id из CommerceML).
Ускоряет и упрощает отправку заказов — без поиска по артикулу.
"""
from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("moysklad_rest_id", sa.String(length=36), nullable=True))
    op.create_index("ix_products_moysklad_rest_id", "products", ["moysklad_rest_id"])


def downgrade() -> None:
    op.drop_index("ix_products_moysklad_rest_id", table_name="products")
    op.drop_column("products", "moysklad_rest_id")

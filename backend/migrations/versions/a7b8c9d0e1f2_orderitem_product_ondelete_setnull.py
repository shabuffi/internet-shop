"""order_items.product_id: nullable + ON DELETE SET NULL

Чтобы «Очистить каталог» мог удалять товары, на которые есть заказы: ссылка обнуляется,
а снимок имени/артикула в order_items сохраняется.

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa

revision = "a7b8c9d0e1f2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("order_items", "product_id", existing_type=sa.String(36), nullable=True)
    op.drop_constraint("order_items_product_id_fkey", "order_items", type_="foreignkey")
    op.create_foreign_key(
        "order_items_product_id_fkey", "order_items", "products",
        ["product_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("order_items_product_id_fkey", "order_items", type_="foreignkey")
    op.create_foreign_key(
        "order_items_product_id_fkey", "order_items", "products", ["product_id"], ["id"],
    )
    op.alter_column("order_items", "product_id", existing_type=sa.String(36), nullable=False)

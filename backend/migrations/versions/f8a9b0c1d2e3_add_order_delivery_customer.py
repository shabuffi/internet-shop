"""add delivery method + customer type/inn + user link to orders

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-06-30

Этап 6: способ получения (самовывоз/транспорт ТД/ТК), данные заказчика (тип, ИНН)
и связь заказа с покупателем из личного кабинета.
"""
from alembic import op
import sqlalchemy as sa

revision = "f8a9b0c1d2e3"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("customer_type", sa.String(length=20), nullable=True))
    op.add_column("orders", sa.Column("customer_inn", sa.String(length=20), nullable=True))
    op.add_column("orders", sa.Column("delivery_method", sa.String(length=30), nullable=True))
    op.add_column("orders", sa.Column("user_id", sa.String(length=36), nullable=True))
    op.create_foreign_key(
        "fk_orders_user_id", "orders", "users", ["user_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_orders_user_id", "orders", type_="foreignkey")
    op.drop_column("orders", "user_id")
    op.drop_column("orders", "delivery_method")
    op.drop_column("orders", "customer_inn")
    op.drop_column("orders", "customer_type")

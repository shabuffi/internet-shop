"""add available + images_manual to products

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-11

available — наличие товара флагом (управляется в админке, не зависит от остатка).
images_manual — картинки заданы вручную на сайте (обмен их не перезаписывает).
"""
from alembic import op
import sqlalchemy as sa

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("available", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("products", sa.Column("images_manual", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("products", "images_manual")
    op.drop_column("products", "available")

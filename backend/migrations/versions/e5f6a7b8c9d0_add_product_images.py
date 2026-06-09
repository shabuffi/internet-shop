"""add images (json) to products

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-09

Список всех картинок товара (имена файлов). image_url остаётся — это первая картинка.
"""
from alembic import op
import sqlalchemy as sa

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("images", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "images")

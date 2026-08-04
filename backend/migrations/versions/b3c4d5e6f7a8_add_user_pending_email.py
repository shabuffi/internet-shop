"""add users.pending_email (безопасная смена email)

Revision ID: b3c4d5e6f7a8
Revises: ba73f69c6f92
Create Date: 2026-08-03

Заявка на смену email хранится отдельно от логина: пока адрес не подтверждён письмом,
``users.email`` не меняется. Обе колонки nullable — существующие покупатели не затронуты.

Unique-индекс на ``pending_email`` НЕ создаём намеренно: два покупателя могут заявить один
и тот же адрес, победит первый подтвердивший (второму отдаём 409). Реальную уникальность
логина по-прежнему держит ``ix_users_email``.
"""
from alembic import op
import sqlalchemy as sa

revision = "b3c4d5e6f7a8"
down_revision = "ba73f69c6f92"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("pending_email", sa.String(), nullable=True))
    op.add_column("users", sa.Column("pending_email_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "pending_email_at")
    op.drop_column("users", "pending_email")

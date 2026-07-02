"""default discount 0 (registered pays base price)

Меняем дефолт персональной корректировки цены с +5% на 0%: зарегистрированный клиент
платит базовую цену X (гость — X+наценка). Существующие клиенты, у кого стоял старый
дефолт 5, сбрасываются в 0; персональные значения (заданные владельцем) не трогаем.

Revision ID: 9f3e7a1c2b48
Revises: 8f1ff656fab5
Create Date: 2026-07-03
"""
from alembic import op

revision = "9f3e7a1c2b48"
down_revision = "8f1ff656fab5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "discount_percent", server_default="0")
    # Сброс только «дефолтных» пятёрок в 0 — кастомные скидки/наценки владельца сохраняем.
    op.execute("UPDATE users SET discount_percent = 0 WHERE discount_percent = 5")


def downgrade() -> None:
    op.alter_column("users", "discount_percent", server_default="5")
    op.execute("UPDATE users SET discount_percent = 5 WHERE discount_percent = 0")

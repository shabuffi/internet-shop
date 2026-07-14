"""unique constraint on users.phone

Revision ID: d6e7f8a9b0c1
Revises: d5e6f7a8b9c0
Create Date: 2026-07-14

Добавляет уникальный индекс на users.phone (один номер = один аккаунт). Перед созданием
индекса проверяет существующие данные: если есть дубли телефонов — миграция ОСТАНАВЛИВАЕТСЯ
с понятным сообщением и НЕ удаляет никакие записи. Дубли нужно устранить вручную и повторить.
"""
from alembic import op
import sqlalchemy as sa

revision = "d6e7f8a9b0c1"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    dups = conn.execute(sa.text(
        "SELECT phone, COUNT(*) AS c FROM users GROUP BY phone HAVING COUNT(*) > 1"
    )).fetchall()
    if dups:
        listing = ", ".join(f"{row[0]} (x{row[1]})" for row in dups)
        raise RuntimeError(
            "Миграция остановлена: в таблице users есть дублирующиеся телефоны — "
            f"{listing}. Записи НЕ удалены. Устраните дубли вручную, затем повторите миграцию."
        )
    op.create_index("ix_users_phone", "users", ["phone"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_phone", table_name="users")

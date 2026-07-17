"""add_category_icon

Revision ID: ba73f69c6f92
Revises: f0a1b2c3d4e5
Create Date: 2026-07-17 19:31:13.613318

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'ba73f69c6f92'
down_revision: Union[str, None] = 'f0a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Только колонка иконки категории. Изменения по promo_categories из autogenerate убраны
    # намеренно — это посторонний дрейф индекс↔unique, к этой задаче отношения не имеет.
    op.add_column('categories', sa.Column('icon', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('categories', 'icon')

"""add_promo_categories

Revision ID: f0a1b2c3d4e5
Revises: d6e7f8a9b0c1
Create Date: 2026-07-16

Создаёт реестр доп-полей МойСклад, таблицу настроек промо-категорий и таблицу связи
«товар ↔ категория».

Реестр (moysklad_properties) бэкфиллится из products.attributes, чтобы выпадающий список в
админке работал СРАЗУ после деплоя, не дожидаясь обмена; настоящий Ид МойСклад защёлкнется
в ms_property_id при первом обмене со схемой.

Сидирует 3 существующие категории (Убойные цены / Спецпредложения / Новинки) с их нынешними
URL-слагами. Порядок меню (display_order) и приоритет эксклюзивности (priority) — РАЗНЫЕ:
в старом коде меню было hot→novinki→special, а приоритет hot>special>novinki.

Членство переносится ТОЛЬКО из булевых флагов products.is_hot/is_sale/is_new — никакого
матчинга по именам доп-полей, чтобы миграция не могла разойтись с нынешней витриной.
Сами флаги пока НЕ удаляются (переходный период).
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'f0a1b2c3d4e5'
down_revision: Union[str, None] = 'd6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Стабильные id сид-категорий (нужны для backfill членства).
_HOT_ID = "00000000-0000-0000-0000-0000000000a1"
_SALE_ID = "00000000-0000-0000-0000-0000000000a2"
_NEW_ID = "00000000-0000-0000-0000-0000000000a3"

# (id, slug, title, имя доп-поля МойСклад, display_order, priority, флаг-колонка для backfill)
#
# Имена доп-полей подтверждены на копии production (16.07.2026): «Убойные цены!» — именно с
# восклицательным знаком. Имя используется ТОЛЬКО здесь, чтобы найти строку реестра; на
# категории оно не хранится. Не совпало → source_field_id останется NULL, категория попросит
# настройки в админке, а членство (backfill из флагов) при этом целое.
#
# display_order — порядок в меню (как было: hot→novinki→special).
# priority — приоритет эксклюзивности (как было: hot > special > novinki).
_SEED = [
    (_HOT_ID, "hot", "Убойные цены", "Убойные цены!", 0, 0, "is_hot"),
    (_NEW_ID, "novinki", "Новинки", "Новинка", 1, 2, "is_new"),
    (_SALE_ID, "special", "Спецпредложения", "Распродажа", 2, 1, "is_sale"),
]


def upgrade() -> None:
    # ─── Реестр доп-полей МойСклад ────────────────────────────────────────────
    op.create_table(
        "moysklad_properties",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("ms_property_id", sa.String(length=255), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("origin", sa.String(length=20), server_default="classifier", nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(op.f("ix_moysklad_properties_ms_property_id"), "moysklad_properties",
                    ["ms_property_id"], unique=True)
    # name НЕ unique: переименование поля в занятое имя иначе роняло бы весь обмен.
    op.create_index(op.f("ix_moysklad_properties_name"), "moysklad_properties", ["name"], unique=False)

    # ─── Настройки промо-категорий ────────────────────────────────────────────
    op.create_table(
        "promo_categories",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("source_field_id", sa.String(length=36),
                  sa.ForeignKey("moysklad_properties.id", ondelete="SET NULL"), nullable=True),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("subtitle", sa.String(length=500), nullable=True),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("priority", sa.Integer(), server_default="0", nullable=False),
        sa.Column("show_in_menu", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("show_on_home", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("show_old_price", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("icon", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("auto_discovered", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    # «Одно поле — одна категория». Несколько NULL Postgres допускает — «поле не выбрано»
    # может быть у многих категорий, и это нужно.
    op.create_index(op.f("ix_promo_categories_source_field_id"), "promo_categories",
                    ["source_field_id"], unique=True)
    op.create_index(op.f("ix_promo_categories_slug"), "promo_categories", ["slug"], unique=True)
    op.create_index(op.f("ix_promo_categories_display_order"), "promo_categories", ["display_order"], unique=False)
    op.create_index(op.f("ix_promo_categories_priority"), "promo_categories", ["priority"], unique=False)
    op.create_index(op.f("ix_promo_categories_is_active"), "promo_categories", ["is_active"], unique=False)

    op.create_table(
        "product_promo_categories",
        sa.Column("product_id", sa.String(length=36), sa.ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("promo_category_id", sa.String(length=36), sa.ForeignKey("promo_categories.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index(op.f("ix_product_promo_categories_promo_category_id"),
                    "product_promo_categories", ["promo_category_id"], unique=False)

    # ─── Бэкфилл реестра из уже сохранённых характеристик товаров ─────────────
    # Даёт выпадающий список сразу после деплоя (до первого обмена). Ид пока неизвестен
    # (ms_property_id NULL) — защёлкнется на первом обмене со схемой.
    # ⚠️ Имена доп-полей в JSON хранятся юникод-эскейпами → только jsonb_array_elements,
    # никаких attributes::text ILIKE (даст ложный ноль).
    op.execute(
        """
        INSERT INTO moysklad_properties (id, ms_property_id, name, origin, last_seen_at, created_at)
        SELECT gen_random_uuid()::text, NULL, e->>'name', 'backfill', NULL, now()
        FROM products, LATERAL jsonb_array_elements(attributes::jsonb) e
        WHERE attributes IS NOT NULL
          AND jsonb_typeof(attributes::jsonb) = 'array'
          AND coalesce(e->>'name', '') <> ''
        GROUP BY e->>'name'
        """
    )

    # ─── Сид 3 стартовых категорий (активны, в меню и на главной — как сейчас) ───
    for (cid, slug, title, field_name, order, prio, _col) in _SEED:
        op.execute(
            sa.text(
                """
                INSERT INTO promo_categories
                    (id, source_field_id, slug, title, display_order, priority,
                     show_in_menu, show_on_home, show_old_price, is_active, auto_discovered)
                VALUES
                    (:cid,
                     (SELECT id FROM moysklad_properties WHERE name = :field_name LIMIT 1),
                     :slug, :title, :order, :prio, true, true, false, true, false)
                """
            ).bindparams(cid=cid, field_name=field_name, slug=slug, title=title,
                         order=order, prio=prio)
        )

    # ─── Backfill членства из булевых флагов ───
    # Единственный источник — флаги. Матчинга по именам здесь нет намеренно: так миграция
    # физически не может разойтись с тем, что сейчас показывает витрина.
    for (cid, _slug, _title, _field_name, _order, _prio, col) in _SEED:
        op.execute(
            f"INSERT INTO product_promo_categories (product_id, promo_category_id) "
            f"SELECT id, '{cid}' FROM products WHERE {col} = true"
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_product_promo_categories_promo_category_id"), table_name="product_promo_categories")
    op.drop_table("product_promo_categories")
    op.drop_index(op.f("ix_promo_categories_is_active"), table_name="promo_categories")
    op.drop_index(op.f("ix_promo_categories_priority"), table_name="promo_categories")
    op.drop_index(op.f("ix_promo_categories_display_order"), table_name="promo_categories")
    op.drop_index(op.f("ix_promo_categories_slug"), table_name="promo_categories")
    op.drop_index(op.f("ix_promo_categories_source_field_id"), table_name="promo_categories")
    op.drop_table("promo_categories")
    op.drop_index(op.f("ix_moysklad_properties_name"), table_name="moysklad_properties")
    op.drop_index(op.f("ix_moysklad_properties_ms_property_id"), table_name="moysklad_properties")
    op.drop_table("moysklad_properties")

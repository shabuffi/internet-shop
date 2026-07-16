"""Сериализация промо-полей товара: старая цена и скрытие служебных доп-полей.

Ключевое, что здесь закреплено: ВСЕ привязки к полям МойСклад идут по идентификатору строки
реестра, а не по строковому имени. Поэтому переименование поля в МойСклад не должно ничего
ломать — ни старую цену, ни фильтр служебных полей.

Счётчики товаров для выпадающего списка (property_registry.product_counts / flag_like_names)
здесь не тестируются: они на Postgres-специфичном jsonb, а фикстура — SQLite in-memory.
"""
from decimal import Decimal

import pytest

from app.db.models.admin import ShopSettings
from app.db.models.product import Product
from app.db.models.promo import MoySkladProperty, PromoCategory
from app.api.v1.endpoints.products import _hidden_attr_names, _old_price_field, _product_out
from app.services import promo_service

OLD_PRICE = "Старая цена"
MIN_QTY = "Минимальная единица отгрузки"


def _setup(db, *, show_old_price=True, configure_old_price=True):
    """Товар в промо-категории «Убойные цены» + доп-поля «Старая цена» и «Мин. единица»."""
    hot_field = MoySkladProperty(id="f-hot", ms_property_id="ms-hot", name="Убойные цены!")
    old_field = MoySkladProperty(id="f-old", ms_property_id="ms-old", name=OLD_PRICE)
    cat = PromoCategory(id="c-hot", source_field_id=hot_field.id, slug="hot", title="Убойные цены",
                        is_active=True, priority=0, show_old_price=show_old_price)
    product = Product(
        id="p1", moysklad_id="ms-p1", name="Товар", price=Decimal("1990"), stock=5,
        attributes=[
            {"name": "Убойные цены!", "value": "1"},
            {"name": OLD_PRICE, "value": "2990"},
            {"name": MIN_QTY, "value": "1"},
        ],
    )
    product.promo_categories.append(cat)
    db.add_all([hot_field, old_field, cat, product])
    if configure_old_price:
        db.add(ShopSettings(key=promo_service.OLD_PRICE_SETTING_KEY, value=old_field.id))
    db.commit()
    return product, old_field


def _serialize(db, product):
    opf = _old_price_field(db)
    return _product_out(product, None, _hidden_attr_names(db, opf), opf)


def test_old_price_shown_and_service_fields_hidden(db_session):
    """Старая цена отдаётся готовой к показу; служебные поля вырезаны, обычные — нет."""
    product, _ = _setup(db_session)
    out = _serialize(db_session, product)
    assert out.old_price == Decimal("2990")
    names = [a["name"] for a in out.attributes]
    # Промо-поле и «Старая цена» — служебные, из характеристик убраны...
    assert "Убойные цены!" not in names and OLD_PRICE not in names
    # ...а обычная характеристика осталась. На проде «Минимальная единица отгрузки» стоит у 524
    # товаров — ошибка фильтра здесь сразу видна покупателю.
    assert names == [MIN_QTY]


def test_old_price_survives_field_rename_in_moysklad(db_session):
    """Регресс: переименование поля в МойСклад не ломает старую цену и не выпускает поле наружу.

    Привязка идёт по ид строки реестра, имя резолвится из него — поэтому смена имени
    подхватывается сама, без перенастройки в админке.
    """
    product, old_field = _setup(db_session)
    assert _serialize(db_session, product).old_price == Decimal("2990")

    # Заказчик переименовал поле; обмен обновил имя в реестре по тому же Ид.
    old_field.name = "Старая цена!"
    product.attributes = [
        {"name": "Убойные цены!", "value": "1"},
        {"name": "Старая цена!", "value": "2990"},
        {"name": MIN_QTY, "value": "1"},
    ]
    db_session.commit()

    out = _serialize(db_session, product)
    assert out.old_price == Decimal("2990")                      # цена не потерялась
    assert [a["name"] for a in out.attributes] == [MIN_QTY]      # поле не вылезло в характеристики


def test_old_price_hidden_when_category_setting_off(db_session):
    """Тумблер «показывать старую цену» выключен → цену не отдаём (поле всё равно скрыто)."""
    product, _ = _setup(db_session, show_old_price=False)
    out = _serialize(db_session, product)
    assert out.old_price is None
    assert OLD_PRICE not in [a["name"] for a in out.attributes]


def test_old_price_dormant_until_configured(db_session):
    """Поле «Старая цена» не выбрано в админке → фича спит, поле видно как обычная характеристика."""
    product, _ = _setup(db_session, configure_old_price=False)
    out = _serialize(db_session, product)
    assert out.old_price is None
    assert OLD_PRICE in [a["name"] for a in out.attributes]


def test_old_price_ignored_when_not_greater_than_current(db_session):
    """Старая цена не больше текущей — не показываем (перечёркнутая «скидка» вверх абсурдна)."""
    product, _ = _setup(db_session)
    product.attributes = [
        {"name": "Убойные цены!", "value": "1"},
        {"name": OLD_PRICE, "value": "1500"},
        {"name": MIN_QTY, "value": "1"},
    ]
    db_session.commit()
    assert _serialize(db_session, product).old_price is None


def test_promo_slugs_and_legacy_shims(db_session):
    """promo_slugs заполняются, deprecated is_* остаются для старых клиентов фронта."""
    product, _ = _setup(db_session)
    out = _serialize(db_session, product)
    assert out.promo_slugs == ["hot"]
    assert out.is_hot is True and out.is_sale is False and out.is_new is False

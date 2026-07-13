"""Проверка: удаление фото в МойСклад доходит до сайта, но безопасные заходы фото НЕ трут.

Гоняется настоящим кодом: parse_import_xml → upsert_catalog. Модель протокола — как на проде
td-engineer.ru (проверено 13.07.2026):
  • ПОЛНЫЙ каталог  <Каталог СодержитТолькоИзменения="false"> — весь ассортимент, 0 картинок;
  • ДЕЛЬТА-выгрузка <Каталог СодержитТолькоИзменения="true">  — изменённые товары полной карточкой.
Удаление фото ловим ТОЛЬКО в дельте; полный каталог фото не трогает (главное — «не потерять фото»).
"""
import uuid
import pytest
from app.db.models.product import Product
from app.integrations.moysklad.commerceml_parser import parse_import_xml
from app.services.import_service import upsert_catalog, MAX_IMAGE_CLEARS


def _import_xml(products_xml: str, changes_only: bool) -> bytes:
    flag = "true" if changes_only else "false"
    return (
        "<?xml version='1.0' encoding='UTF-8'?>"
        "<КоммерческаяИнформация ВерсияСхемы='2.04'>"
        "<Классификатор><Ид>clf</Ид>"
        "<Группы><Группа><Ид>g1</Ид><Наименование>Группа</Наименование></Группа></Группы>"
        "</Классификатор>"
        f"<Каталог СодержитТолькоИзменения='{flag}'><Товары>{products_xml}</Товары></Каталог>"
        "</КоммерческаяИнформация>"
    ).encode("utf-8")


def _tovar(msid: str, name: str, kartinka: str | None = None) -> str:
    img = f"<Картинка>{kartinka}</Картинка>" if kartinka is not None else ""
    return f"<Товар><Ид>{msid}</Ид><Наименование>{name}</Наименование>{img}</Товар>"


@pytest.fixture
def db(db_session):
    """Тестовая БД — SQLite in-memory из conftest (``db_session``), а НЕ реальный
    ``SessionLocal``/postgres. Локально тест проходил только потому, что хост ``db``
    резолвился через docker-сеть; в CI (нативный pytest, без стека) хоста ``db`` нет →
    ``could not translate host name "db"``. Делегируем на общую тестовую сессию."""
    return db_session


def _seed(db, msid: str, images: list[str]) -> Product:
    p = Product(
        id=str(uuid.uuid4()), moysklad_id=msid, name="seed",
        images=images, image_url=(images[0] if images else None),
    )
    db.add(p)
    db.commit()
    return p


def _cleanup(db, msids):
    db.query(Product).filter(Product.moysklad_id.in_(msids)).delete(synchronize_session=False)
    db.commit()


def test_full_catalog_without_images_keeps_photos(db):
    """ГЛАВНЫЙ: полный каталог (СодержитТолькоИзменения=false), 0 картинок — как боевой обмен
    остатками. Фото у товаров, где они уже есть, НЕ должны стереться."""
    ms = f"guard-full-{uuid.uuid4().hex[:8]}"
    _seed(db, ms, ["photo1.png"])
    try:
        xml = _import_xml(_tovar(ms, "Товар без картинки в полном каталоге"), changes_only=False)
        catalog = parse_import_xml(xml)
        assert catalog.changes_only is False
        upsert_catalog(db, catalog)
        db.expire_all()
        p = db.query(Product).filter_by(moysklad_id=ms).one()
        assert p.images == ["photo1.png"], f"фото стёрлось на полном каталоге: {p.images!r}"
    finally:
        _cleanup(db, [ms])


def test_delta_deletes_removed_photo(db):
    """ЦЕЛЕВОЙ: дельта-выгрузка (true). У товара с фото тег есть → фото остаётся; у товара, где
    фото удалили в МС, тега нет → фото удаляется на сайте."""
    ms_keep = f"guard-del-a-{uuid.uuid4().hex[:8]}"
    ms_del = f"guard-del-b-{uuid.uuid4().hex[:8]}"
    _seed(db, ms_keep, ["a.png"])
    _seed(db, ms_del, ["b.png"])
    try:
        xml = _import_xml(
            _tovar(ms_keep, "С фото", "a.png") + _tovar(ms_del, "Фото удалили в МС"),
            changes_only=True,
        )
        catalog = parse_import_xml(xml)
        assert catalog.changes_only is True
        upsert_catalog(db, catalog)
        db.expire_all()
        keep = db.query(Product).filter_by(moysklad_id=ms_keep).one()
        deleted = db.query(Product).filter_by(moysklad_id=ms_del).one()
        assert keep.images == ["a.png"], f"уцелевшее фото пропало: {keep.images!r}"
        assert deleted.images == [], f"удаление фото не применилось: {deleted.images!r}"
    finally:
        _cleanup(db, [ms_keep, ms_del])


def test_delta_mass_clear_blocked_by_guard(db):
    """Предохранитель: если дельта требует стереть фото у > MAX_IMAGE_CLEARS товаров (признак
    сбоя выгрузки, а не реальных удалений) — фото сохраняются."""
    n = MAX_IMAGE_CLEARS + 5
    msids = [f"guard-mass-{i}-{uuid.uuid4().hex[:6]}" for i in range(n)]
    for ms in msids:
        _seed(db, ms, [f"{ms}.png"])
    try:
        xml = _import_xml("".join(_tovar(ms, "Без тега") for ms in msids), changes_only=True)
        catalog = parse_import_xml(xml)
        upsert_catalog(db, catalog)
        db.expire_all()
        survived = [p for p in db.query(Product).filter(Product.moysklad_id.in_(msids)).all() if p.images]
        assert len(survived) == n, f"предохранитель не сработал, уцелело {len(survived)}/{n}"
    finally:
        _cleanup(db, msids)

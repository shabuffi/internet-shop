"""
Общие фикстуры тестов.

Тестовая БД — SQLite в памяти (StaticPool, чтобы соединение жило между запросами).
get_db подменяется на тестовую сессию через dependency_overrides.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db

# Импортируем все модели, чтобы они зарегистрировались в Base.metadata
import app.db.models.product  # noqa: F401
import app.db.models.order     # noqa: F401
import app.db.models.admin     # noqa: F401
import app.db.models.user      # noqa: F401
import app.db.models.promo     # noqa: F401
import app.db.models.lead      # noqa: F401

from app.main import app


@pytest.fixture(autouse=True)
def _isolated_media_dir(tmp_path, monkeypatch):
    """Каждый тест — со своим пустым MEDIA_DIR. Без этого тесты в контейнере пишут и
    удаляют файлы в настоящем томе media (dev-«Очистить каталог» стирал все фото локально)."""
    from app.core.config import settings
    media = tmp_path / "media_isolated"   # не "media": так называет свою папку test_import_service
    media.mkdir()
    monkeypatch.setattr(settings, "MEDIA_DIR", str(media))
    # Выключатели отдачи картинок — по умолчанию как в коде, а не из локального .env.
    monkeypatch.setattr(settings, "MEDIA_VARIANTS", False)
    monkeypatch.setattr(settings, "MEDIA_ACCEL", False)
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "off")
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SAVE", "off")
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_MARK", "icon")


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def client(db_session):
    """TestClient с подменённой на тестовую сессией БД."""
    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

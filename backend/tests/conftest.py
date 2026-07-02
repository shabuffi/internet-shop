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

from app.main import app


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

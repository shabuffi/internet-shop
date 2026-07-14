from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.core.config import settings

# pool_timeout: сколько ждать свободное соединение, когда пул исчерпан. Дефолтные 30с
# бессмысленны: фронт обрывает SSR-запрос по своему таймауту в 8с (frontend/src/lib/api.ts),
# то есть тред uvicorn ещё 22с держит место в очереди для клиента, который уже ушёл. Ждём 5с
# и падаем — тред и место в очереди освобождаются, затор рассасывается быстрее.
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_timeout=5)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: открывает сессию БД на время запроса, закрывает после."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

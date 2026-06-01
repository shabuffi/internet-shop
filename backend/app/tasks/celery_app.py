from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "shop",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.sync"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Europe/Moscow",
    beat_schedule={
        # Синхронизация каталога из МойСклад по расписанию
        "sync-catalog": {
            "task": "app.tasks.sync.sync_catalog",
            "schedule": settings.SYNC_INTERVAL_SECONDS,
        },
    },
)

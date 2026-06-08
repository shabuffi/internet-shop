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
        # Каждые 10 минут пере-отправляем в МойСклад заказы, которые не уехали
        # (МойСклад был недоступен дольше ретраев / задача потерялась). Идемпотентно.
        "resync-pending-orders": {
            "task": "app.tasks.sync.resync_pending_orders",
            "schedule": 600.0,
        },
    },
)

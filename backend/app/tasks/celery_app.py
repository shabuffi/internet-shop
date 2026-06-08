from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "shop",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.notify"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Europe/Moscow",
    # Запланированных задач нет: каталог/остатки/картинки приходят push-моделью
    # (CommerceML от МойСклад), заказы МойСклад забирает сам через обмен. beat простаивает.
    beat_schedule={},
)

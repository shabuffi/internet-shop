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
    # Запланированных задач нет: каталог приходит push-моделью (CommerceML от МойСклад),
    # а загрузка картинок запускается из админки вручную. beat-контейнер пока простаивает —
    # если понадобится автозагрузка картинок по расписанию, добавить сюда fetch_product_images.
    beat_schedule={},
)

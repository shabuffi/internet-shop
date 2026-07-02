from celery import Celery
from app.core.config import settings
from app.core.sentry import init_sentry

# Мониторинг ошибок в воркере/бите (no-op без SENTRY_DSN)
init_sentry()

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
    # Каталог/остатки/картинки приходят push-моделью (CommerceML от МойСклад), заказы
    # МойСклад забирает сам. Единственная периодическая задача — мониторинг простоя обмена:
    # раз в час проверяем, что МойСклад выходит на связь, иначе алерт владельцу.
    beat_schedule={
        "check-exchange-health": {
            "task": "app.tasks.notify.check_exchange_health",
            "schedule": 3600.0,   # каждый час
        },
    },
)

from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "shop",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.sync", "app.tasks.notify"],
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
        # Каждые 15 минут дотягиваем из REST МойСклад картинку/описание/rest_id для
        # новых товаров (CommerceML их не приносит). Батч 50 за раз — само-троттлинг
        # к API МойСклад; когда всё обогащено, запрос возвращает 0 и задача дешёвая.
        # Ручная кнопка в админке остаётся для разовой массовой загрузки.
        "enrich-products": {
            "task": "app.tasks.sync.fetch_product_images",
            "schedule": 900.0,
        },
    },
)

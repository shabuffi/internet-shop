"""Инициализация Sentry (мониторинг ошибок).

Включается, только если задан ``SENTRY_DSN`` (env / .env.prod). Без DSN — no-op, ничего
не шлётся. sentry-sdk сам подхватывает интеграции FastAPI и Celery, поэтому отдельной
настройки не нужно — достаточно вызвать :func:`init_sentry` на старте web и worker.
"""

from app.core.config import settings


def init_sentry() -> None:
    """Поднимает Sentry, если задан DSN. Иначе ничего не делает."""
    if not settings.SENTRY_DSN:
        return
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=0.0,      # только ошибки, без трейсинга производительности
        send_default_pii=False,      # не отправляем персональные данные покупателей
        environment="production" if not settings.DEBUG else "development",
    )

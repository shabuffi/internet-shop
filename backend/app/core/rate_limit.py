"""Простой rate-limit на Redis: счётчик обращений в скользящем окне.

Использует общий ``redis_client``. При недоступности Redis не блокирует запрос
(fail-open) — вход/регистрация важнее строгого лимита, а Redis у нас и так
критичен для обмена (если он лежит — проблемы шире, чем брутфорс).
"""

from fastapi import HTTPException, Request

from app.core.redis_client import redis_client


def client_ip(request: Request) -> str:
    """IP клиента с учётом прокси nginx: первый адрес из ``X-Forwarded-For``."""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(key: str, limit: int, window_sec: int) -> None:
    """Не более ``limit`` обращений за ``window_sec`` секунд на ключ; иначе 429."""
    try:
        n = redis_client.incr(key)
        if n == 1:
            redis_client.expire(key, window_sec)
    except Exception:
        return  # Redis недоступен — не блокируем (fail-open)
    if n > limit:
        raise HTTPException(
            status_code=429,
            detail="Слишком много попыток. Попробуйте через несколько минут.",
        )

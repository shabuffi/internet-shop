"""
Общий Redis-клиент приложения (отдельно от Celery-брокера).
Используется для состояния обмена CommerceML — чтобы оно переживало
перезапуск backend и работало при нескольких воркерах uvicorn.
"""

import redis

from app.core.config import settings

# decode_responses=False — храним и бинарные данные (XML), и строки.
# Подключение ленивое: реального коннекта до первой команды не происходит.
redis_client: redis.Redis = redis.Redis.from_url(settings.REDIS_URL, decode_responses=False)

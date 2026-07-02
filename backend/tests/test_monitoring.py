"""Тесты мониторинга простоя обмена МойСклад (check_exchange_health).

Проверяем redis-ориентированную логику решения (без БД/отправки): нет данных,
свежий контакт → ok (флаг снят), простой при уже стоящем флаге → кулдаун (не алертит).
Полный путь алерта (БД + каналы) проверен вручную.
"""

from datetime import datetime, timezone, timedelta

import pytest


@pytest.fixture(autouse=True)
def _redis_or_skip():
    from app.core.redis_client import redis_client
    try:
        redis_client.ping()
    except Exception:
        pytest.skip("Redis недоступен")
    yield
    redis_client.delete("exchange:last_seen", "exchange:stale_alerted")


def _set_last_seen(hours_ago: float):
    from app.core.redis_client import redis_client
    ts = (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()
    redis_client.set("exchange:last_seen", ts)


def test_no_data_when_never_exchanged():
    from app.core.redis_client import redis_client
    from app.tasks.notify import check_exchange_health
    redis_client.delete("exchange:last_seen", "exchange:stale_alerted")
    assert check_exchange_health()["status"] == "no_data"


def test_fresh_contact_is_ok_and_clears_flag():
    from app.core.redis_client import redis_client
    from app.tasks.notify import check_exchange_health
    _set_last_seen(1)                              # 1ч назад — свежо
    redis_client.set("exchange:stale_alerted", "1")   # был выставлен ранее
    r = check_exchange_health()
    assert r["status"] == "ok"
    assert redis_client.get("exchange:stale_alerted") is None   # флаг снят


def test_stale_with_cooldown_does_not_realert():
    from app.core.redis_client import redis_client
    from app.tasks.notify import check_exchange_health
    _set_last_seen(48)                             # 48ч > порога 24ч
    redis_client.set("exchange:stale_alerted", "1")   # уже алертили — кулдаун
    r = check_exchange_health()
    assert r["status"] == "stale"
    assert r["alerted"] is False                   # повторно не шлём (без обращения к БД/каналам)

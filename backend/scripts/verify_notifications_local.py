"""ЛОКАЛЬНАЯ проверка бага «уведомление о регистрации не уходит НИКУДА».

Баг: у Order есть relationship("User"). Если воркер сконфигурирует маппер Order РАНЬШЕ,
чем импортирован User (напр. первым в процессе прошёл ЗАКАЗ: notify_new_order → db.get(Order)
без импорта User), configure_mappers падает и ОТРАВЛЯЕТ реестр на весь процесс — после этого
любая регистрация валится на db.get(User), и письмо владельцу не уходит ни письмом, ни в ВК.

Почему обычный тест «зарегистрируйся и посмотри» НЕ ловит баг: если регистрация идёт первой,
она сама импортирует User, реестр здоров — и даже НЕФИКШЕНЫЙ код отрабатывает штатно. Баг
проявляется только в прод-последовательности «сначала заказ, потом регистрация». Поэтому здесь
мы проверяем именно её — в ОТДЕЛЬНОМ интерпретаторе (в общем процессе модели уже импортированы).

Безопасность: отправка не вызывается вообще (краш происходит ДО отправки); наружу ничего не идёт.

Запуск на ТЕКУЩЕМ (нефикшеном) коде локали — воспроизводит баг:
    docker compose exec backend python3 scripts/verify_notifications_local.py

Запуск на коде ЭТОЙ ветки (с фиксом) — баг закрыт:
    docker compose run --rm --no-deps \
      -v "$(git -C .claude/worktrees/secure-email-change-validation-31eb3a rev-parse --show-toplevel)/backend:/app" \
      backend python3 scripts/verify_notifications_local.py
"""

import subprocess
import sys

# Прод-последовательность в свежем процессе: ЗАКАЗ (Order) конфигурит мапперы РАНЬШЕ, чем
# импортирован User, — затем РЕГИСТРАЦИЯ. На отравлённом реестре db.get(User) падает.
POISON_SEQUENCE = r"""
from app.tasks.notify import notify_new_registration          # моделей ещё не тянет (ленивый импорт)
from app.db.models.order import Order
from app.db.session import SessionLocal
db = SessionLocal()
try:
    db.get(Order, '00000000-0000-0000-0000-000000000000')     # это делает notify_new_order на каждый заказ
except Exception:
    pass
# Теперь регистрация. Если реестр отравлен — упадёт на db.get(User) ВНУТРИ задачи.
notify_new_registration('00000000-0000-0000-0000-000000000000')
print('REGISTRATION_OK')
"""


def main() -> int:
    print("=" * 72)
    print("Проверка: ломается ли регистрация, если перед ней прошёл заказ (прод-сценарий)")
    print("=" * 72)
    res = subprocess.run([sys.executable, "-c", POISON_SEQUENCE], capture_output=True, text=True)

    poisoned = "InvalidRequestError" in res.stderr or "failed to locate a name" in res.stderr
    ok = "REGISTRATION_OK" in res.stdout

    if ok and not poisoned:
        print("✅ Регистрация отработала ДАЖЕ после заказа — реестр мапперов не отравляется.")
        print("   Это ожидаемо на коде с фиксом (order.py импортирует User).")
        print("\nИТОГ: ✅ баг закрыт — письмо о регистрации будет уходить по всем каналам.")
        return 0

    print("❌ Регистрация УПАЛА после заказа — реестр мапперов отравлен.")
    print("   Ключевая строка ошибки из воркера:")
    for line in res.stderr.splitlines():
        if "InvalidRequestError" in line or "failed to locate a name" in line:
            print("     " + line.strip()[:200])
            break
    print("\nИТОГ: ❌ баг ВОСПРОИЗВЁЛСЯ — это код БЕЗ фикса (так сейчас на проде: 4/4 краша за неделю).")
    print("   На проде из-за этого письмо о регистрации не уходит НИКУДА, пока воркер не перезапустят.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

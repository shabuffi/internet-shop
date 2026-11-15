"""Отправка зашифрованного бэкапа (БД + .env.prod) на почту владельца.

Вызывается из ``scripts/email-backup.sh`` на хосте: архив уже зашифрован ``age`` открытым
ключом владельца (расшифровать может только он), сюда приходит в stdin::

    docker compose exec -T backend python3 -m app.services.backup_mail <кому> <имя_файла> < архив.age

Письмо уходит через SMTP сайта (админка → Настройки), как уведомления о заказах.
"""

import sys
from datetime import datetime

from app.integrations.email import send_email_detail

# Почтовые лимиты на вложение: Яндекс ~30 МБ, но base64 раздувает на треть — держим запас.
MAX_BYTES = 20 * 1024 * 1024


def main(argv: list[str]) -> int:
    """Читает архив из stdin и шлёт письмом. Код возврата 0 — письмо принято SMTP."""
    if len(argv) != 3:
        print("usage: python3 -m app.services.backup_mail <to> <filename> < archive")
        return 2
    to, filename = argv[1], argv[2]
    data = sys.stdin.buffer.read()
    if not data:
        print("FAIL: пустой архив")
        return 1
    stamp = datetime.now().strftime("%d.%m.%Y %H:%M")
    if len(data) > MAX_BYTES:
        ok, err = send_email_detail(
            to, f"⚠️ Бэкап td-engineer.ru {stamp}: архив слишком большой для почты",
            f"Архив {len(data) // 1024 // 1024} МБ — больше лимита {MAX_BYTES // 1024 // 1024} МБ, "
            "письмом не отправлен. Нужен другой способ (облако).", from_name="Бэкап td-engineer.ru")
        print("FAIL: архив больше лимита, отправлено предупреждение" if ok else f"FAIL: {err}")
        return 1
    body = (
        f"Ночной бэкап td-engineer.ru от {stamp}.\n\n"
        f"Во вложении {filename} ({len(data) // 1024} КБ): база данных (pg_dump) и .env.prod,\n"
        "зашифрованы вашим ключом age — открыть можно только вашим секретным ключом.\n\n"
        "Как восстановить — docs/BACKUP_RESTORE.md в репозитории.\n"
    )
    ok, err = send_email_detail(to, f"Бэкап td-engineer.ru {stamp}", body,
                                from_name="Бэкап td-engineer.ru", attachments=[(filename, data)])
    print("OK" if ok else f"FAIL: {err}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))

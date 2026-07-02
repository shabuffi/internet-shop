#!/bin/bash
# Ручной бэкап прод-БД (тот же дамп, что deploy.sh делает перед миграциями).
# Запуск на сервере: cd /opt/internet-shop && ./backup-db.sh
set -e

COMPOSE="docker compose --env-file .env.prod -f docker-compose.prod.yml"
mkdir -p backups
BACKUP="backups/backup_$(date +%F_%H%M%S).sql"

$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$BACKUP"
[ -s "$BACKUP" ] || { echo "ERROR: пустой дамп"; rm -f "$BACKUP"; exit 1; }

echo "Backup saved: $BACKUP ($(du -h "$BACKUP" | cut -f1))"
# оставляем последние 10 бэкапов
ls -1t backups/*.sql 2>/dev/null | tail -n +11 | xargs -r rm -f

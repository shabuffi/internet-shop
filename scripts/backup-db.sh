#!/bin/bash
# Бэкап базы данных (pg_dump) с ротацией.
#
# Запуск:  ./scripts/backup-db.sh
# Авто (cron, ежедневно в 3:00):
#   0 3 * * * cd /opt/internet-shop && ./scripts/backup-db.sh >> /var/log/shop-backup.log 2>&1
#
# Переменные окружения (необязательно):
#   BACKUP_DIR  — куда складывать дампы (по умолчанию ./backups)
#   KEEP        — сколько последних дампов хранить (по умолчанию 14)
set -euo pipefail

cd "$(dirname "$0")/.."   # корень проекта

# Прод или дев — выбираем compose-файл и env автоматически
if [ -f .env.prod ]; then
  COMPOSE="docker compose --env-file .env.prod -f docker-compose.prod.yml"
  ENVFILE=.env.prod
else
  COMPOSE="docker compose"
  ENVFILE=.env
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${KEEP:-14}"
mkdir -p "$BACKUP_DIR"

DB_USER=$(grep -E '^POSTGRES_USER=' "$ENVFILE" | cut -d= -f2- | tr -d '"'"'"'')
DB_NAME=$(grep -E '^POSTGRES_DB=' "$ENVFILE" | cut -d= -f2- | tr -d '"'"'"'')

TS=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/db_${TS}.sql.gz"

# Дамп всей БД → gzip. -T: без TTY (для cron).
$COMPOSE exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$FILE"
echo "Бэкап готов: $FILE ($(du -h "$FILE" | cut -f1))"

# Ротация: оставляем KEEP самых свежих, остальные удаляем
ls -1t "$BACKUP_DIR"/db_*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "Хранится дампов: $(ls -1 "$BACKUP_DIR"/db_*.sql.gz 2>/dev/null | wc -l | tr -d ' ') (лимит $KEEP)"

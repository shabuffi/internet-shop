#!/bin/bash
# Ночной бэкап БД + .env.prod НА ПОЧТУ владельца, зашифрованный age (открытым ключом владельца —
# расшифровать может только он, даже сервер не может). Фото сюда не входят (~9 GB) — см. offsite-backup.sh.
#
# Настройки — /etc/default/offsite-backup:
#   BACKUP_EMAIL=адрес                  — куда слать
#   BACKUP_AGE_RECIPIENT=age1...        — открытый ключ владельца (age-keygen на его Mac)
# Расшифровка у владельца:  age -d -i ~/td-engineer-backup-key.txt файл.age | tar xz
set -euo pipefail

cd "$(dirname "$0")/.."
: "${BACKUP_EMAIL:?BACKUP_EMAIL не задан (/etc/default/offsite-backup)}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT не задан (/etc/default/offsite-backup)}"
COMPOSE="docker compose --env-file .env.prod -f docker-compose.prod.yml"
TS=$(date +%F_%H%M)
NAME="td-engineer_${TS}.tar.gz.age"
log() { echo "[$(date '+%F %T')] $*"; }

TMP=$(mktemp -d /tmp/emailbk.XXXXXX)
trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"

$COMPOSE exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$TMP/shop_${TS}.dump" < /dev/null
[ -s "$TMP/shop_${TS}.dump" ] || { log "ОШИБКА: пустой дамп БД"; exit 1; }
$COMPOSE exec -T db pg_restore --list < "$TMP/shop_${TS}.dump" > /dev/null || { log "ОШИБКА: дамп не читается"; exit 1; }
cp .env.prod "$TMP/env.prod"
tar -C "$TMP" -czf "$TMP/bk.tar.gz" "shop_${TS}.dump" env.prod
age -r "$BACKUP_AGE_RECIPIENT" -o "$TMP/$NAME" "$TMP/bk.tar.gz"
log "Архив $NAME: $(du -h "$TMP/$NAME" | cut -f1)"

$COMPOSE exec -T backend python3 -m app.services.backup_mail "$BACKUP_EMAIL" "$NAME" < "$TMP/$NAME"
mkdir -p /var/lib/offsite-backup && echo "$(date -Is) $NAME" > /var/lib/offsite-backup/email_last_ok
log "Отправлено на $BACKUP_EMAIL"

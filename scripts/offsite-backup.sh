#!/bin/bash
# Off-site бэкап на Яндекс Диск: rclone + шифрование (crypt). Восстановление — docs/BACKUP_RESTORE.md.
#
# Что уходит (всё — в зашифрованный remote, по умолчанию `yacrypt:`):
#   db/shop_<дата>.dump       — pg_dump -Fc всей БД (хранится 30 дней)
#   config/env.prod           — .env.prod (прежние версии → config/old/<дата>/)
#   media/                    — том фото (оригиналы, sync_xml); БЕЗ копий _v/ (их делает prewarm)
#                               удалённые/заменённые файлы → media-old/<дата>/ (хранятся 30 дней)
#
# Нужен /root/.config/rclone/rclone.conf с remote'ами `yadisk` (Яндекс Диск) и `yacrypt`
# (crypt поверх yadisk:td-engineer-backup) — создаётся владельцем, см. docs/BACKUP_RESTORE.md.
#
# Запуск вручную:  /opt/internet-shop/scripts/offsite-backup.sh
# По расписанию:   systemd-таймер offsite-backup.timer (каждую ночь), лог — journalctl -u offsite-backup
set -euo pipefail

cd "$(dirname "$0")/.."
REMOTE="${REMOTE:-yacrypt:}"
KEEP_DAYS="${KEEP_DAYS:-30}"
COMPOSE="docker compose --env-file .env.prod -f docker-compose.prod.yml"
TS=$(date +%F_%H%M)
RC="rclone --config /root/.config/rclone/rclone.conf --stats-one-line --stats 0"

log() { echo "[$(date '+%F %T')] $*"; }

if ! $RC listremotes 2>/dev/null | grep -qx "${REMOTE%%:*}:"; then
  log "ОШИБКА: remote ${REMOTE} не настроен (rclone.conf) — см. docs/BACKUP_RESTORE.md"; exit 2
fi

TMP=$(mktemp -d /tmp/offsite.XXXXXX)
trap 'rm -rf "$TMP"' EXIT

# 1. База: custom-формат (сжатый, восстанавливается pg_restore), сразу проверяем, что читается.
DUMP="$TMP/shop_${TS}.dump"
$COMPOSE exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$DUMP" < /dev/null
[ -s "$DUMP" ] || { log "ОШИБКА: пустой дамп БД"; exit 1; }
$COMPOSE exec -T db pg_restore --list < "$DUMP" > /dev/null || { log "ОШИБКА: дамп не читается pg_restore"; exit 1; }
log "БД: дамп $(du -h "$DUMP" | cut -f1)"
$RC copy "$DUMP" "${REMOTE}db/"
$RC delete "${REMOTE}db/" --min-age "${KEEP_DAYS}d"

# 2. Секреты/настройки (код — в git, его не бэкапим).
$RC copyto .env.prod "${REMOTE}config/env.prod" --backup-dir "${REMOTE}config/old/${TS}"

# 3. Фото: инкрементально — едут только новые/изменённые файлы.
# Выключатель BACKUP_MEDIA (по умолчанию 1) — в /etc/default/offsite-backup: фото ~9 GB,
# на бесплатный Яндекс Диск (5 GB) не влезают — до покупки места бэкапим только БД и .env.
WHAT="БД + .env.prod"
if [ "${BACKUP_MEDIA:-1}" = "1" ]; then
  MEDIA=$(docker volume inspect -f '{{.Mountpoint}}' internet-shop_media_data)
  $RC sync "$MEDIA" "${REMOTE}media" \
    --exclude "/_v/**" --exclude "*.tmp" --exclude "._*" \
    --backup-dir "${REMOTE}media-old/${TS}" --transfers 4 --checkers 8
  $RC delete "${REMOTE}media-old" --min-age "${KEEP_DAYS}d" 2>/dev/null || true
  $RC rmdirs "${REMOTE}media-old" --leave-root 2>/dev/null || true
  WHAT="$WHAT + фото"
else
  log "Фото пропущены (BACKUP_MEDIA=${BACKUP_MEDIA})"
fi

# Отметка «последний успешный бэкап» — видно с сервера: cat /var/lib/offsite-backup/last_ok
mkdir -p /var/lib/offsite-backup && echo "$(date -Is) $WHAT" > /var/lib/offsite-backup/last_ok
log "Готово: $WHAT → ${REMOTE}"

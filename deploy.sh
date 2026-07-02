#!/bin/bash
set -e

echo "=== Deploy internet-shop ==="

# 1. Устанавливаем Docker если нет
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "Docker installed. Log out and back in, then re-run this script."
    exit 0
fi

# 2. Проверяем что .env.prod есть
if [ ! -f .env.prod ]; then
    echo "ERROR: .env.prod not found!"
    echo "Copy .env.prod.example → .env.prod and fill in real values"
    exit 1
fi

# --env-file .env.prod нужен, чтобы Compose подставлял ${POSTGRES_*} в сервис db
# (env_file внутри сервисов прокидывает переменные только в контейнеры, не в подстановку)
COMPOSE="docker compose --env-file .env.prod -f docker-compose.prod.yml"

# 3. Собираем и запускаем
echo "Building images..."
$COMPOSE build

echo "Starting services..."
$COMPOSE up -d

echo "Waiting for DB..."
sleep 5

# Бэкап БД ПЕРЕД миграциями — чтобы можно было откатиться. Храним последние 10.
echo "Backing up DB before migrations..."
mkdir -p backups
BACKUP="backups/backup_$(date +%F_%H%M%S).sql"
if $COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$BACKUP" 2>/dev/null && [ -s "$BACKUP" ]; then
    echo "Backup saved: $BACKUP ($(du -h "$BACKUP" | cut -f1))"
    ls -1t backups/*.sql 2>/dev/null | tail -n +11 | xargs -r rm -f
else
    echo "ERROR: backup failed — aborting deploy (migrations NOT run)"
    rm -f "$BACKUP"
    exit 1
fi

echo "Running migrations..."
$COMPOSE exec -T backend alembic upgrade head

# Перезапускаем nginx, чтобы он перечитал новые IP пересозданных backend/frontend
# (иначе после деплоя ловим 502 Bad Gateway — nginx помнит старые адреса контейнеров)
echo "Restarting nginx..."
$COMPOSE restart nginx

echo ""
echo "=== Deploy complete! ==="
echo "Shop is running at http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP')"
echo "API docs: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP')/docs"

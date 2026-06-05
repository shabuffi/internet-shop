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

echo "Running migrations..."
$COMPOSE exec -T backend alembic upgrade head

echo ""
echo "=== Deploy complete! ==="
echo "Shop is running at http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP')"
echo "API docs: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP')/docs"

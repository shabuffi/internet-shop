.PHONY: up down build logs migrate shell-backend shell-db test test-e2e

# Запустить всё в фоне
up:
	docker compose up --build -d

# Запустить с логами в консоли (удобно для отладки)
up-logs:
	docker compose up --build

# Остановить всё
down:
	docker compose down

# Остановить и удалить данные БД (осторожно!)
down-volumes:
	docker compose down -v

# Пересобрать образы
build:
	docker compose build

# Посмотреть логи всех сервисов
logs:
	docker compose logs -f

# Логи конкретного сервиса: make logs-backend
logs-%:
	docker compose logs -f $*

# Применить миграции БД
migrate:
	docker compose exec backend alembic upgrade head

# Создать новую миграцию: make migration name="add_products_table"
migration:
	docker compose exec backend alembic revision --autogenerate -m "$(name)"

# Зайти в консоль backend контейнера
shell-backend:
	docker compose exec backend bash

# Зайти в PostgreSQL
shell-db:
	docker compose exec db psql -U $${POSTGRES_USER} -d $${POSTGRES_DB}

# Статус контейнеров
status:
	docker compose ps

# Прогнать тесты backend (pytest в контейнере)
test:
	docker compose exec backend python3 -m pytest

# Прогнать E2E-тесты фронта (Playwright, с хоста против поднятого стека).
# Требует: make up (стек запущен) + cd frontend && npm install (один раз).
test-e2e:
	cd frontend && npx playwright test

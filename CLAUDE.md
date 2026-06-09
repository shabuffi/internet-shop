# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Production-ready internet shop with МойСклад (MoySklad) as the master catalog system. МойСклад pushes product data via CommerceML XML to the shop; orders flow back the other direction.

## Common Commands

All services run in Docker. The root `Makefile` wraps the most-used commands:

```bash
make up            # build images and start all 7 services in background
make up-logs       # same but stream logs to console
make down          # stop all containers
make down-volumes  # stop and wipe postgres volume (destructive)
make logs          # tail all service logs
make logs-backend  # tail a single service (logs-frontend, logs-worker, etc.)
make migrate       # apply pending Alembic migrations
make migration name="describe_change"  # autogenerate new migration
make shell-backend # bash inside the running backend container
make shell-db      # psql inside the running postgres container
make status        # docker compose ps
```

After any backend Python change, uvicorn hot-reloads automatically (volume-mounted). After any frontend change, Next.js hot-reloads automatically.

**Running a one-off Python snippet against the live stack:**
```bash
docker compose exec backend python3 -c "from app.core.config import settings; print(settings.DATABASE_URL)"
```

**Applying a migration after adding a new SQLAlchemy model:**
```bash
# 1. Import the model module in backend/migrations/env.py
# 2. Then:
make migration name="add_orders_table"
make migrate
```

## Architecture

### Services (docker-compose.yml)

| Service | Image | Port | Role |
|---|---|---|---|
| `backend` | Python 3.12 / FastAPI | 8000 | Storefront API + CommerceML exchange (catalog in, orders out) |
| `worker` | same image | — | Celery worker (background tasks) |
| `beat` | same image | — | Celery beat (scheduled tasks) |
| `db` | postgres:16 | 5432 | Primary database |
| `redis` | redis:7 | 6379 | Celery broker + result backend |
| `frontend` | node:20 / Next.js 15 | 3000 | Storefront (SSR) |
| `nginx` | nginx:alpine | 80 | Reverse proxy: `/api/*` → backend, rest → frontend |

### Data flow

Интеграция **только через CommerceML** — пароль аккаунта МойСклад НЕ используется
(нужна лишь выдуманная пара логин/пароль обмена). REST API МойСклад полностью убран.

```
Каталог/остатки/картинки (вниз):
МойСклад ──CommerceML (import.xml + offers.xml + файлы картинок)──▶ /api/v1/1c/exchange
        ──▶ import_service.upsert_catalog() ──▶ products table; картинки ──▶ media_storage (том)

Витрина:
Browser ──▶ Next.js (SSR) ──▶ /api/v1/products ──▶ products table
Browser ──▶ /api/v1/products/{id}/image ──▶ media_storage (отдаём файл картинки)

Заказы (вверх):
Browser ──form──▶ POST /api/v1/orders ──▶ orders table (+ списание остатка, уведомление ТГ/ВК)
МойСклад ──GET ?type=sale&mode=query──▶ exchange отдаёт неэкспортированные заказы CommerceML-XML
        ──GET ?mode=success──▶ помечаем exported_at; МойСклад сам создаёт контрагента и резерв
```

### Backend layout (`backend/app/`)

- `main.py` — FastAPI app construction, middleware, router registration
- `core/config.py` — `Settings` (pydantic-settings, reads `.env`)
- `db/session.py` — SQLAlchemy engine, `SessionLocal`, `Base`, `get_db` dependency
- `db/models/` — ORM models: `product.py` (Product, Category, SyncLog), `order.py` (Order, OrderItem)
- `migrations/` — Alembic; `env.py` imports all model modules so autogenerate works
- `api/v1/endpoints/` — routers: `products.py`, `exchange.py`, `orders.py`, `admin.py`
- `schemas/` — Pydantic request/response models (separate from ORM models)
- `services/` — `import_service.upsert_catalog()`; `media_storage.py` (картинки из обмена)
- `integrations/moysklad/commerceml_parser.py` — парсер каталога (import.xml/offers.xml);
  `commerceml_orders.py` — сериализатор заказов в CommerceML-XML для выгрузки
- `tasks/celery_app.py` — Celery app (beat пустой); `tasks/notify.py` — уведомления ТГ/ВК
  (единственная фоновая задача; REST-задачи sync.py удалены)

### CommerceML exchange protocol

Один эндпоинт `/api/v1/1c/exchange` обслуживает **два направления** (см. `exchange.py`).

**Каталог вниз (МойСклад → магазин), `type=catalog`:**
1. `GET ?mode=checkauth` → три строки `success\n<cookie_name>\n<cookie_value>`
2. `GET ?mode=init` → `zip=no\nfile_limit=10485760`
3. `POST ?mode=file&filename=import.xml` → каталог (имя/описание/артикул/`<Картинка>`); сырьё в Redis
4. `POST ?mode=file&filename=offers.xml` → цены/остатки; сырьё в Redis
5. `POST ?mode=file&filename=<uuid>_imageid.png` → **файл картинки** → `media_storage` (том)
6. `GET ?mode=import&filename=import.xml` → `upsert_catalog()` (offers применяются здесь же)

**Заказы вверх (магазин → МойСклад), `type=sale`** — МойСклад сам забирает заказы:
1. `GET ?type=sale&mode=checkauth` / `mode=init`
2. `GET ?type=sale&mode=query` → отдаём неэкспортированные заказы CommerceML-XML (`commerceml_orders.build_orders_xml`)
3. `GET ?type=sale&mode=success` → помечаем заказы `exported_at`

МойСклад шлёт CommerceML **без** `xmlns`. Парсер определяет это через `_detect_ns()` и
понимает теги и с namespace, и без.

Состояние обмена (токен сессии + сырьё файлов) — в **Redis** с TTL (переживает перезапуск
и несколько воркеров). Картинки — на диске (том `media_data`).

⚠️ Важно: если МойСклад в заходе с картинкой шлёт второй `import.xml` **без** offers,
цену/остаток перезаписывать нельзя — гард `ParsedProduct.has_offer` (иначе обнулятся).

### Frontend layout (`frontend/src/`)

- `app/` — Next.js 15 App Router pages (all Server Components by default)
- `app/layout.tsx` — root layout with shared header
- `app/page.tsx` — catalog page (product grid)
- `app/products/[id]/page.tsx` — product detail page
- `lib/api.ts` — fetch wrappers; uses `http://backend:8000` server-side and `/api/v1` client-side
- `types/product.ts` — TypeScript interfaces matching backend Pydantic schemas

### Key conventions

- **Integration is CommerceML-only**: пароль/токен аккаунта МойСклад НЕ нужен и НЕ хранится. Всё (каталог, остатки, картинки, заказы) идёт через обмен с выдуманной парой логин/пароль (`exchange_login`/`exchange_password` в админке). REST API МойСклад удалён.
- **Prices**: stored as `Numeric(12,2)` in rubles. МойСклад historically stores in kopecks but the CommerceML `offers.xml` from this account sends rubles directly — do not divide by 100.
- **Product identity**: `Product.moysklad_id` — это `<Ид>` из выгрузки каталога; стабильный ключ для upsert И для сопоставления позиций при выгрузке заказов (Коды связи: уникальные для магазина). `Product.id` — наш внутренний UUID.
- **Order export**: заказ выгружается, когда `exported_at IS NULL` и `status != cancelled`; МойСклад забирает по расписанию (pull). Мгновенно — только уведомление владельцу (ТГ/ВК) и списание остатка на сайте.
- **Migrations**: always import new model modules in `migrations/env.py` before running autogenerate.
- **ALLOWED_ORIGINS** in `.env` must be a JSON array string: `ALLOWED_ORIGINS=["http://localhost:3000"]`
- **Local tunnel**: during development, `ngrok http 8000` exposes the CommerceML endpoint to МойСклад. The ngrok URL is pasted into МойСклад → Онлайн-торговля → Адрес магазина.

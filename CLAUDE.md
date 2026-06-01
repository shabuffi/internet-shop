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
| `backend` | Python 3.12 / FastAPI | 8000 | REST API + CommerceML receiver |
| `worker` | same image | — | Celery worker (background tasks) |
| `beat` | same image | — | Celery beat (scheduled tasks) |
| `db` | postgres:16 | 5432 | Primary database |
| `redis` | redis:7 | 6379 | Celery broker + result backend |
| `frontend` | node:20 / Next.js 15 | 3000 | Storefront (SSR) |
| `nginx` | nginx:alpine | 80 | Reverse proxy: `/api/*` → backend, rest → frontend |

### Data flow

```
МойСклад ──CommerceML XML──▶ /api/v1/1c/exchange ──▶ import_service.upsert_catalog() ──▶ products table
                                                                                             │
Browser ──────────────────▶ Next.js (SSR) ──▶ /api/v1/products ──▶ products table ──────────┘
Browser ──────── form ────▶ POST /api/v1/orders ──▶ orders table ──▶ (sync to МойСклад, Sprint 4)
```

### Backend layout (`backend/app/`)

- `main.py` — FastAPI app construction, middleware, router registration
- `core/config.py` — `Settings` (pydantic-settings, reads `.env`)
- `db/session.py` — SQLAlchemy engine, `SessionLocal`, `Base`, `get_db` dependency
- `db/models/` — ORM models: `product.py` (Product, Category, SyncLog), `order.py` (Order, OrderItem)
- `migrations/` — Alembic; `env.py` imports all model modules so autogenerate works
- `api/v1/endpoints/` — routers: `products.py`, `exchange.py`, (orders.py coming)
- `schemas/` — Pydantic request/response models (separate from ORM models)
- `services/` — business logic decoupled from HTTP: `import_service.upsert_catalog()`
- `integrations/moysklad/commerceml_parser.py` — lxml XML parser, returns `ParsedCatalog`
- `tasks/celery_app.py` — Celery app + beat schedule; `tasks/sync.py` — scheduled sync stub

### CommerceML exchange protocol

МойСклад calls our endpoint in this exact order (all to `/api/v1/1c/exchange`):

1. `GET ?mode=checkauth` → must return exactly three lines: `success\n<cookie_name>\n<cookie_value>`
2. `GET ?mode=init` → returns `zip=no\nfile_limit=10485760`
3. `POST ?mode=file&filename=import.xml` → body is the catalog XML; parsed immediately into `_pending_catalog`
4. `POST ?mode=file&filename=offers.xml` → body is prices/stock; applied to `_pending_catalog` immediately
5. `GET ?mode=import&filename=import.xml` → triggers `upsert_catalog()`, clears state
6. `GET ?mode=import&filename=offers.xml` → no-op (prices already applied in step 4)

МойСклад sends CommerceML **without** an `xmlns` namespace declaration. The parser auto-detects this via `_detect_ns()` and handles both namespaced and bare tags.

`_pending_catalog` and `_file_storage` are module-level globals. **Known tech debt:** not safe under multiple workers or restarts — replace with Redis in production.

### Frontend layout (`frontend/src/`)

- `app/` — Next.js 15 App Router pages (all Server Components by default)
- `app/layout.tsx` — root layout with shared header
- `app/page.tsx` — catalog page (product grid)
- `app/products/[id]/page.tsx` — product detail page
- `lib/api.ts` — fetch wrappers; uses `http://backend:8000` server-side and `/api/v1` client-side
- `types/product.ts` — TypeScript interfaces matching backend Pydantic schemas

### Key conventions

- **Prices**: stored as `Numeric(12,2)` in rubles. МойСклад historically stores in kopecks but the CommerceML `offers.xml` from this account sends rubles directly — do not divide by 100.
- **Product identity**: `Product.moysklad_id` is the stable key for upserts; `Product.id` is our internal UUID.
- **Migrations**: always import new model modules in `migrations/env.py` before running autogenerate.
- **ALLOWED_ORIGINS** in `.env` must be a JSON array string: `ALLOWED_ORIGINS=["http://localhost:3000"]`
- **Local tunnel**: during development, `ngrok http 8000` exposes the CommerceML endpoint to МойСклад. The ngrok URL is pasted into МойСклад → Онлайн-торговля → Адрес магазина.

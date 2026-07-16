import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.sentry import init_sentry

# Мониторинг ошибок (no-op, если SENTRY_DSN не задан) — до создания приложения
init_sentry()

# Логи приложения (logger'ы app.*) — uvicorn по умолчанию их не показывает. Даём
# логгеру "app" собственный обработчик на INFO, чтобы logger.info(...) был виден в
# docker logs (нужно, в т.ч., чтобы наблюдать протокол обмена МойСклад).
_app_logger = logging.getLogger("app")
if not _app_logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    _app_logger.addHandler(_handler)
_app_logger.setLevel(logging.INFO)
_app_logger.propagate = False

# Интерактивная документация (Swagger/Redoc/OpenAPI) — только в DEBUG. На проде
# отключена, чтобы не раскрывать карту API (в т.ч. /admin/*, /1c/exchange, /dev/*).
_docs_url = "/docs" if settings.DEBUG else None
_redoc_url = "/redoc" if settings.DEBUG else None
_openapi_url = "/openapi.json" if settings.DEBUG else None

app = FastAPI(
    title="Internet Shop API",
    description="Backend для интернет-магазина с интеграцией МойСклад",
    version="0.1.0",
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
def health_check():
    """Проверка что сервер живой. Nginx и мониторинг обращаются сюда."""
    return {"status": "ok"}


from app.api.v1.endpoints.exchange import router as exchange_router
from app.api.v1.endpoints.products import router as products_router
from app.api.v1.endpoints.orders import router as orders_router
from app.api.v1.endpoints.admin import router as admin_router
from app.api.v1.endpoints.leads import router as leads_router
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.legal import router as legal_router
from app.api.v1.endpoints.promo import router as promo_router

app.include_router(exchange_router, prefix="/api/v1")
app.include_router(products_router, prefix="/api/v1")
app.include_router(orders_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(leads_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(legal_router, prefix="/api/v1")
app.include_router(promo_router, prefix="/api/v1")

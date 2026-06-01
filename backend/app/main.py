from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(
    title="Internet Shop API",
    description="Backend для интернет-магазина с интеграцией МойСклад",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
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
app.include_router(exchange_router, prefix="/api/v1")

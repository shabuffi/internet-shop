from decimal import Decimal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432

    @property
    def DATABASE_URL(self) -> str:
        """Строка подключения SQLAlchemy к PostgreSQL (собрана из POSTGRES_*)."""
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # Redis / Celery
    REDIS_URL: str = "redis://redis:6379/0"

    # Каталог для картинок товаров, пришедших файлами в обмене CommerceML
    MEDIA_DIR: str = "/app/media"

    # App
    SECRET_KEY: str
    DEBUG: bool = False
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # Куки авторизации только по HTTPS. False — для HTTP-прода; после переезда на домен
    # с TLS выставить COOKIE_SECURE=True в .env.prod (тогда куки не уйдут по открытому HTTP).
    COOKIE_SECURE: bool = False

    # Минимальная сумма заказа (руб). Заказ ниже порога не оформляется (проверка в orders.py).
    MIN_ORDER_AMOUNT: int = 5000

    # Наценка на цену МойСклад для незарегистрированных/не вошедших покупателей (в %).
    # Вошедшие клиенты видят свою персональную скидку (см. User.discount_percent).
    # Цена считается на бэкенде (services/pricing.py), округление до копеек.
    DEFAULT_MARKUP_PERCENT: Decimal = Decimal("10")

    # Пароль страницы «Разработчик» (техническая настройка: обмен, ВК, SMTP).
    # Задаётся в .env.prod. Пустой — страница недоступна.
    DEV_PASSWORD: str = ""

    # Уведомления о новых заказах (фолбэк к значениям из админки / ShopSettings)
    VK_GROUP_TOKEN: str = ""
    VK_PEER_ID: str = ""

    # SMTP для письма-подтверждения покупателю
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""

    # Мониторинг ошибок (Sentry) — включается, только если задан DSN
    SENTRY_DSN: str = ""


settings = Settings()

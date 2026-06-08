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

    # МойСклад
    MOYSKLAD_LOGIN: str = ""
    MOYSKLAD_PASSWORD: str = ""

    # Уведомления о новых заказах (фолбэк к значениям из админки / ShopSettings)
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    VK_GROUP_TOKEN: str = ""
    VK_PEER_ID: str = ""


settings = Settings()

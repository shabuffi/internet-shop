from pydantic import BaseModel, field_validator


class LeadIn(BaseModel):
    """Входные данные заявки с сайта."""

    name: str
    phone: str
    shop_name: str | None = None
    region: str | None = None
    comment: str | None = None

    @field_validator("name", "phone")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Поле обязательно")
        return v.strip()

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PromoCategoryPublic(BaseModel):
    """Промо-категория для витрины (меню/ленты/страницы). Технических полей нет."""
    model_config = ConfigDict(from_attributes=True)

    slug: str
    title: str
    subtitle: str | None = None
    icon: str | None = None
    display_order: int = 0
    show_in_menu: bool = False
    show_on_home: bool = False
    show_old_price: bool = False


class PromoCategoryAdmin(BaseModel):
    """Промо-категория для админки — бизнес-настройки. slug не отдаём (техническая деталь)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    subtitle: str | None = None
    icon: str | None = None
    display_order: int = 0
    priority: int = 0
    show_in_menu: bool = False
    show_on_home: bool = False
    show_old_price: bool = False
    is_active: bool = False
    auto_discovered: bool = False
    product_count: int = 0
    # Привязка к доп-полю МойСклад. id — только для <select> (в UI не показывается);
    # name — человекочитаемая подпись из реестра, следует за переименованием в МойСклад.
    # source_field_id = None → «поле не выбрано», категория требует настройки.
    source_field_id: str | None = None
    source_field_name: str | None = None


class PromoCategoryCreate(BaseModel):
    """Создание категории: название + выбранное из списка доп-поле МойСклад.

    slug генерируется системой из title; вводить имя поля строкой нельзя — только выбрать
    из реестра (см. GET /admin/moysklad-properties).
    """
    title: str
    source_field_id: str | None = None
    subtitle: str | None = None


class PromoCategoryUpdate(BaseModel):
    """Патч настроек. Все поля опциональны; slug менять нельзя (URL стабилен)."""
    title: str | None = None
    subtitle: str | None = None
    icon: str | None = None
    display_order: int | None = None
    priority: int | None = None
    show_in_menu: bool | None = None
    show_on_home: bool | None = None
    show_old_price: bool | None = None
    is_active: bool | None = None
    source_field_id: str | None = None


class MoySkladPropertyOut(BaseModel):
    """Доп-поле МойСклад для выпадающего списка в админке."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    origin: str = "classifier"
    last_seen_at: datetime | None = None
    # Сколько товаров заполняют это поле — считается на лету (~12 мс на 12.5k товаров).
    product_count: int = 0
    # Все непустые значения похожи на галочку (0/1, да/нет) — ПОДСКАЗКА для сортировки списка,
    # не запрет: владелец вправе выбрать любое поле.
    looks_like_flag: bool = False
    # Название категории, которая уже заняла это поле (одно поле — одна категория), иначе None.
    taken_by: str | None = None

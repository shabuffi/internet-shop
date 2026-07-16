import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Table, Column, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


class MoySkladProperty(Base):
    """Реестр доп-полей МойСклад — источник выпадающего списка в админке.

    Наполняется на каждом обмене из <Классификатор><Свойства> (Ид → имя). Это единственное
    место, где живёт ИМЯ доп-поля: на промо-категории имя не дублируется, иначе кэш расходился
    бы с МойСклад при переименовании поля.

    ``id`` — НАШ суррогатный uuid, а не Ид МойСклад. Так строка реестра существует ещё до того,
    как поле пришло в классификаторе (бэкфилл из products.attributes), и «защёлка» настоящего
    Ид не требует перепривязки категорий: PromoCategory.source_field_id остаётся прежним.
    """
    __tablename__ = "moysklad_properties"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # Ид свойства из классификатора МойСклад — стабильный ключ, переживающий переименование.
    # NULL, пока поле не пришло в классификаторе (строки бэкфилла и реквизиты).
    ms_property_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    # Актуальное имя поля. Обновляется обменом → подпись в админке следует за переименованием.
    # НЕ unique: поле могли переименовать в имя, которое уже носит другая строка — уникальность
    # здесь роняла бы весь обмен на constraint (ключ — ms_property_id, не имя).
    name: Mapped[str] = mapped_column(String(255), index=True)
    # classifier — пришло свойством классификатора (есть Ид, защищено от переименования);
    # requisite — реквизит товара (Ид не бывает); backfill — восстановлено из products.attributes.
    origin: Mapped[str] = mapped_column(String(20), default="classifier", server_default="classifier")
    # Когда поле последний раз пришло в обмене. Пропавшее поле НЕ удаляем (порвались бы привязки) —
    # показываем в админке «не приходило с ‹дата›».
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# Связь «товар ↔ промо-категория» (many-to-many). Членство — производная сайта:
# пересчитывается импортом из МойСклад, при удалении категории удаляется каскадом
# (исходные данные МойСклад в Product.attributes при этом не трогаются).
product_promo_categories = Table(
    "product_promo_categories",
    Base.metadata,
    Column("product_id", String(36), ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
    Column("promo_category_id", String(36), ForeignKey("promo_categories.id", ondelete="CASCADE"),
           primary_key=True, index=True),
)


class PromoCategory(Base):
    """Промо-категория витрины («Убойные цены», «Новинки», «Спецпредложения», …).

    Пользовательские настройки хранятся отдельно от данных МойСклад. Категорию создаёт
    администратор, выбирая доп-поле МойСклад из выпадающего списка (реестр
    :class:`MoySkladProperty`); обмен категорий НЕ создаёт. «Ручная» категория, не связанная
    с МойСклад, допустима — ``source_field_id`` NULL, импорт такие не трогает.
    """
    __tablename__ = "promo_categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # Привязка к доп-полю МойСклад — ЕДИНСТВЕННЫЙ ключ; имя поля здесь не хранится (читается из
    # реестра, иначе кэш устарел бы при переименовании). NULL = «поле не выбрано»: ручная
    # категория либо ещё не настроенная (витрина работает, членство заморожено).
    # UNIQUE = «одно поле — одна категория»; несколько NULL Postgres допускает — и это нужно.
    source_field_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("moysklad_properties.id", ondelete="SET NULL"),
        unique=True, nullable=True,
    )
    # Внутренний технический слаг: маршрутизация/API. Генерируется системой из title, неизменяем,
    # пользователю не показывается и не редактируется.
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    subtitle: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Порядок показа в меню и на главной. НЕ приоритет — см. priority.
    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", index=True)
    # Приоритет «основной» категории: если товар попал в несколько, показываем его в секции с
    # наименьшим priority и бейдж берём оттуда же. Развязан с display_order намеренно — в старом
    # коде порядок меню (hot→novinki→special) и приоритет (hot>special>novinki) РАЗНЫЕ, одним
    # полем обе семантики не воспроизвести.
    priority: Mapped[int] = mapped_column(Integer, default=0, server_default="0", index=True)
    show_in_menu: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    show_on_home: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    show_old_price: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Имя загруженного файла-иконки в media_storage (upload_<uuid>.<ext>); отдаётся публично
    # через существующий GET /admin/media/{name}. NULL — рисуется фолбэк по slug.
    icon: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", index=True)
    # Происхождение категории. Авто-обнаружения больше нет (эвристика ложно срабатывала на
    # обычных характеристиках), поэтому всегда false; колонка оставлена под возможный возврат.
    auto_discovered: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    products: Mapped[list["Product"]] = relationship(  # noqa: F821
        secondary=product_promo_categories, back_populates="promo_categories"
    )
    # Строка реестра с именем доп-поля. lazy="joined" — имя нужно почти всегда, когда нужна
    # категория (фильтр служебных полей на выдаче, подпись в админке), а строк реестра единицы.
    source_field: Mapped["MoySkladProperty | None"] = relationship(lazy="joined")

    @property
    def source_field_name(self) -> str | None:
        """Актуальное имя доп-поля МойСклад (из реестра) или None, если поле не выбрано."""
        return self.source_field.name if self.source_field else None

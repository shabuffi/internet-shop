"""Общая логика промо-категорий: сопоставление доп-полей МойСклад, генерация slug,
извлечение «старой цены». Используется импортом (services/import_service) и API
(api/v1/endpoints/products, promo).

Имя доп-поля здесь НЕ хардкодится: какое поле отвечает за промо — решает администратор,
выбирая его из реестра МойСклад (services/property_registry), а имя поля «Старая цена» лежит
в настройках (shop_settings['promo.old_price_field']).
"""
import re
from decimal import Decimal, InvalidOperation

# Ключ настройки со «старой ценой». Значение — ИД СТРОКИ РЕЕСТРА (moysklad_properties.id),
# а не имя поля: имя резолвится через реестр, поэтому переименование поля в МойСклад ничего не
# ломает. Тот же принцип, что у промо-категорий (PromoCategory.source_field_id) — все привязки
# к полям МойСклад в проекте идут по идентификатору реестра, а не по строке.
# Пока ключ не задан — фича спит.
OLD_PRICE_SETTING_KEY = "promo.old_price_field_id"

# Библиотека своих иконок: JSON-список имён файлов в медиа-хранилище. Лежит в настройках —
# как `brands`, поэтому обходится без миграции. Побочный (и нужный) эффект: media/orphans
# ищет занятые файлы подстрокой по всему тексту настроек, так что иконка из библиотеки не
# считается бесхозной, даже пока её не выбрал ни один раздел.
ICON_LIBRARY_SETTING_KEY = "promo.icon_library"

# Вид бейджа кодируется в единственную колонку PromoCategory.icon (String(255)):
#   "upload_<uuid>.png"          — легаси: просто имя файла
#   "lucide:<имя>:<HEX6>"        — иконка встроенного набора + цвет круга
#   "upload:<имя файла>:<HEX6>"  — своя картинка + цвет круга
# Разбор дублируется на фронте (frontend/src/lib/promo.ts) — формат один на две стороны.
_ICON_UPLOAD_RE = re.compile(r"^upload:([^:]+):[0-9A-Fa-f]{6}$")


def icon_file_name(icon: str | None) -> str | None:
    """Имя файла, на который ссылается значение ``PromoCategory.icon``.

    Нужно всем, кто решает «занят ли файл»: media/orphans и удаление иконки из библиотеки.
    Поэтому разбор обязан ошибаться в сторону «занят»: не узнав файл в значении, которое на
    него ссылается, мы разрешили бы удалить картинку живого раздела.

    Схема `icon` в БД не валидируется (``PromoCategoryUpdate.icon`` — обычная строка), так что
    значение с битым цветом (``upload:a.png:ZZZZZZ``) вполне может там оказаться. Строгую
    регулярку оно не пройдёт, но имя файла из него достать можно и нужно — «легаси, голое имя
    файла» для строки с двоеточиями не подходит: тогда ключ занятости не совпал бы с именем
    файла на диске, и защита от удаления занятой иконки промахнулась бы.

    Args:
        icon: Значение колонки ``icon`` в любой из трёх форм (или испорченное).

    Returns:
        Имя файла в медиа-хранилище либо ``None`` — если иконки нет или она из
        встроенного набора (файла за ней не стоит).
    """
    if not icon:
        return None
    match = _ICON_UPLOAD_RE.match(icon)
    if match:
        return match.group(1)
    if icon.startswith("upload:"):
        # Форма узнана, но цвет битый — файл всё равно занят. Середина и есть имя.
        return icon.split(":")[1] or None
    if icon.startswith("lucide:"):
        return None   # за встроенной иконкой файла нет ни в каком виде
    return icon   # легаси — голое имя файла

# Значения-галочки, которые считаем «выключено» (иначе — «включено»).
# Публично (без подчёркивания) — этим же списком считает товары property_registry.product_counts,
# и число в админке обязано совпадать с тем, что импорт положит в раздел.
FLAG_FALSE_VALUES = frozenset({"", "false", "нет", "0", "no", "off", "ложь", "none", "-"})
_FLAG_FALSE = FLAG_FALSE_VALUES

# Явно «включённые» значения галочки.
_FLAG_TRUE = {"да", "true", "1", "yes", "on", "истина", "+", "есть", "y", "t"}

# Слаги, которые нельзя выдавать авто-сгенерированным категориям — совпали бы со
# статическими top-level маршрутами фронта (кроме сид-категорий hot/novinki/special,
# которым эти URL принадлежат намеренно).
RESERVED_SLUGS = {
    "catalog", "cart", "checkout", "about", "contacts", "admin", "account",
    "login", "register", "forgot", "reset", "offer", "payment", "products",
    "how-to-order", "promo", "api",
}

_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c",
    "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya",
}


def is_flag_on(value) -> bool:
    """Включена ли галочка доп-поля (непустое, не из _FLAG_FALSE)."""
    return str(value or "").strip().lower() not in _FLAG_FALSE


def is_flag_like_value(value) -> bool:
    """Похоже ли значение на «галочку» (0/1, да/нет, true/false).

    ⚠️ Только ПОДСКАЗКА для админки (какие поля показать первыми в выпадающем списке) — НЕ
    фильтр и не критерий выбора. Раньше похожая проверка решала за владельца, какое поле
    считать промо-категорией, и на реальных данных ошибалась: «Минимальная единица отгрузки»
    имеет значение «1» у 467 товаров и проходила как «галочка». Решение за администратором.
    """
    return str(value or "").strip().lower() in (_FLAG_TRUE | _FLAG_FALSE)


def attr_value(attributes, name: str):
    """Значение доп-поля по имени (без учёта регистра/пробелов); None — если нет."""
    low = (name or "").strip().lower()
    for a in attributes or []:
        if (a.get("name") or "").strip().lower() == low:
            return a.get("value")
    return None


def matched_source_fields(attributes, source_fields: set[str]) -> set[str]:
    """Множество ``source_field`` из ``source_fields``, у которых у товара включённое значение."""
    on: set[str] = set()
    for a in attributes or []:
        name = (a.get("name") or "").strip()
        if name in source_fields and is_flag_on(a.get("value")):
            on.add(name)
    return on


def old_price_from_attributes(attributes, field_name: str | None) -> Decimal | None:
    """«Старая цена» из доп-поля ``field_name`` (число > 0) или None.

    ``field_name`` — имя, выбранное владельцем (shop_settings). None/пусто → фича не настроена,
    старую цену не показываем.
    """
    if not field_name:
        return None
    raw = attr_value(attributes, field_name)
    if raw is None:
        return None
    try:
        val = Decimal(str(raw).replace(" ", "").replace(",", "."))
    except (InvalidOperation, ValueError):
        return None
    return val if val > 0 else None


def slugify(text: str) -> str:
    """Транслит кириллицы в безопасный slug (латиница/цифры/дефис)."""
    out: list[str] = []
    for ch in (text or "").strip().lower():
        if ch in _TRANSLIT:
            out.append(_TRANSLIT[ch])
        elif ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_"):
            out.append("-")
    slug = re.sub(r"-+", "-", "".join(out)).strip("-")
    return slug or "promo"


def unique_slug(base: str, taken: set[str]) -> str:
    """Уникальный slug: избегает ``taken`` и зарезервированных путей (суффиксом -2, -3…)."""
    reserved = taken | RESERVED_SLUGS
    if base not in reserved:
        return base
    i = 2
    while f"{base}-{i}" in reserved:
        i += 1
    return f"{base}-{i}"

"""Хранилище картинок товаров, приходящих файлами в обмене CommerceML.

При выгрузке каталога с включённой опцией «Выгружать изображения» МойСклад присылает
файлы картинок отдельными POST'ами обмена (``mode=file``). Мы сохраняем их в медиа-каталог
(том ``MEDIA_DIR``) и отдаём из него через прокси-эндпоинт — без обращения к REST API
МойСклад (а значит без пароля аккаунта).
"""

import mimetypes
import os

from app.core.config import settings

# Расширения, которые считаем картинками в обмене
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def _safe_name(filename: str) -> str:
    """Возвращает безопасное имя файла — только basename, без путей.

    Защита от path traversal: ``../../etc`` и ``import_files/a.jpg`` сводятся к ``a.jpg``.

    Args:
        filename: Имя/путь файла из обмена.

    Returns:
        Базовое имя файла без каталогов.
    """
    return os.path.basename(filename.replace("\\", "/"))


def is_image_filename(filename: str) -> bool:
    """Проверяет, похоже ли имя файла на картинку (по расширению).

    Args:
        filename: Имя файла из обмена.

    Returns:
        ``True``, если расширение из :data:`IMAGE_EXTENSIONS`.
    """
    return os.path.splitext(_safe_name(filename))[1].lower() in IMAGE_EXTENSIONS


def image_name(raw: str | None) -> str | None:
    """Нормализует значение ``<Картинка>`` из import.xml в имя файла в хранилище.

    Args:
        raw: Значение тега ``<Картинка>`` (обычно относительный путь вроде
            ``import_files/abc.jpg``) либо ``None``.

    Returns:
        Базовое имя файла или ``None``.
    """
    return _safe_name(raw) if raw else None


def save_image(filename: str, data: bytes) -> str:
    """Сохраняет байты картинки в медиа-каталог.

    Args:
        filename: Имя файла из обмена (приводится к basename).
        data: Байты картинки.

    Returns:
        Имя сохранённого файла (basename), которым он связывается с товаром.
    """
    name = _safe_name(filename)
    os.makedirs(settings.MEDIA_DIR, exist_ok=True)
    with open(os.path.join(settings.MEDIA_DIR, name), "wb") as f:
        f.write(data)
    return name


def read_image(name: str) -> tuple[bytes, str] | None:
    """Читает картинку из медиа-каталога по имени.

    Args:
        name: Имя файла (basename), как хранится в ``Product.image_url``.

    Returns:
        Кортеж ``(байты, content_type)`` или ``None``, если файла нет.
    """
    path = os.path.join(settings.MEDIA_DIR, _safe_name(name))
    if not os.path.isfile(path):
        return None
    with open(path, "rb") as f:
        data = f.read()
    content_type = mimetypes.guess_type(path)[0] or "image/jpeg"
    return data, content_type

"""Уменьшенные копии картинок (превью/карточка) и отдача файлов картинок.

Оригиналы из обмена весят ~1 MB (до 4.4 MB, PNG до 4032px) — наружу их больше не отдаём:
по запросу делаем копию нужного размера без EXIF (поворот применяем, метаданные и геометку
выкидываем) и кладём в кэш на томе (``MEDIA_DIR/_v``). Копия создаётся один раз при первом
запросе (или заранее: ``python3 -m app.services.media_variants prewarm``).

Что важно и почему (грабли прошлых инцидентов с фото):

* Оригиналы и привязки фото НЕ трогаем — только читаем. Обмен и ``images`` в БД этот модуль
  не касаются, поэтому повторить «обнуление фото» он не может конструктивно.
* Имя копии содержит mtime и размер оригинала: новый файл под тем же именем → новая копия и
  новый ETag (замена фото не «залипает»). Устаревшие копии просто не используются.
* Память бэкенда у потолка — не больше ``_MAX_PARALLEL`` обработок на процесс, JPEG
  декодируется сразу уменьшенным (``draft``), огромные картинки не обрабатываем.
* Любая ошибка (битый файл, перегрузка) — не 500, а оригинал как раньше + запись в лог.
* Запись атомарная (tmp + ``os.replace``): воркеров uvicorn два, они не мешают друг другу.
* Права 644 — копии должен читать nginx (другой пользователь), см. ``MEDIA_ACCEL``.
* Водяной знак (логотип) — на всех копиях фото товаров: фото снимает сам владелец, и любая
  скачанная копия должна нести логотип. На показываемых (thumb/card/og) — лёгкий
  (``MEDIA_WATERMARK``), на копии ``save`` — крупный (``MEDIA_WATERMARK_SAVE``): её отдаёт
  невидимый слой поверх большого фото на карточке, т.е. именно она уходит по «Сохранить
  картинку». Настройки знака входят в имя копии — их смена даёт новые копии.
"""

import glob
import logging
import mimetypes
import os
import sys
import tempfile
import threading
from functools import lru_cache

from fastapi import Request
from fastapi.responses import FileResponse, Response
from PIL import Image, ImageFilter

from app.core.config import settings
from app.services.media_storage import media_path

log = logging.getLogger(__name__)

# В python:3.12-slim встроенная таблица mimetypes не знает .webp (а /etc/mime.types нет) —
# без этого копии уходили бы с Content-Type: image/jpeg.
mimetypes.add_type("image/webp", ".webp")

# Размер → (длинная сторона, формат). WebP для сайта (меньше, держит прозрачность PNG);
# JPEG для og:image — его гарантированно понимают все соцсети и мессенджеры.
VARIANTS: dict[str, tuple[int, str]] = {
    "thumb": (500, "WEBP"),    # каталог, корзина, оформление, миниатюры галереи
    # 900, а не 1200: рамка фото на карточке ~365px (ПК) / ~343px (телефон) — 900 хватает и
    # для Retina. Видимая копия без знака, поэтому чем она мельче, тем меньше ценность
    # чистого фото, которое можно унести по прямому адресу.
    "card": (900, "WEBP"),     # большое фото на карточке товара
    "og": (1200, "JPEG"),      # превью ссылки в соцсетях/мессенджерах
    "save": (1200, "WEBP"),    # невидимый слой «для сохранения» поверх фото на карточке
    # Невидимый слой поверх превью (каталог, «Новинки»/промо, список, корзина, миниатюры):
    # того же размера, что thumb, — иначе каждая карточка тянула бы ещё и 1200px.
    "thumb_save": (500, "WEBP"),
    "media": (1920, "WEBP"),   # баннеры/бренды/иконки (/admin/media/{name})
}
VARIANT_DIR = "_v"
# Размеры фото товаров — на них ставится водяной знак (media — баннеры/бренды/иконки — без).
WATERMARKED = {"thumb", "card", "og", "save", "thumb_save"}
# Копии «для сохранения» — со знаком MEDIA_WATERMARK_SAVE (остальные — MEDIA_WATERMARK).
SAVE_SIZES = {"save", "thumb_save"}
# Версия оформления знака (обводка и т.п.): входит в имя копии — менять при смене рисования.
_MARK_STYLE = 2
_LOGO_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "watermark.png")

# Не обрабатываем: SVG — вектор, GIF — может быть анимацией (копия её бы убила).
_SKIP_EXT = {".svg", ".gif"}
# Защита памяти: больше ~25 Мпикс (≈100 MB RGBA в памяти) не декодируем — отдаём оригинал.
_MAX_PIXELS = 25_000_000
_MAX_PARALLEL = 2
_WAIT_SEC = 10
_sem = threading.BoundedSemaphore(_MAX_PARALLEL)
# EXIF Orientation → поворот (то же, что ImageOps.exif_transpose, но на уменьшенной копии).
_ORIENTATION = {
    2: Image.Transpose.FLIP_LEFT_RIGHT,
    3: Image.Transpose.ROTATE_180,
    4: Image.Transpose.FLIP_TOP_BOTTOM,
    5: Image.Transpose.TRANSPOSE,
    6: Image.Transpose.ROTATE_270,
    7: Image.Transpose.TRANSVERSE,
    8: Image.Transpose.ROTATE_90,
}


def _variant_dir() -> str:
    return os.path.join(settings.MEDIA_DIR, VARIANT_DIR)


def _watermark_mode(size: str) -> tuple[str, float] | None:
    """Знак для этого размера: (``corner``/``center``, непрозрачность) или ``None``."""
    if size not in WATERMARKED:
        return None
    if size in SAVE_SIZES:
        mode, opacity = settings.MEDIA_WATERMARK_SAVE, settings.MEDIA_WATERMARK_SAVE_OPACITY
    else:
        mode, opacity = settings.MEDIA_WATERMARK, settings.MEDIA_WATERMARK_OPACITY
    if mode not in ("corner", "center", "corners"):
        return None
    return mode, min(max(opacity, 0.0), 1.0)


def _variant_path(name: str, size: str, st: os.stat_result) -> str:
    stem = os.path.splitext(os.path.basename(name))[0]
    ext = ".jpg" if VARIANTS[size][1] == "JPEG" else ".webp"
    tag = ""
    wm = _watermark_mode(size)
    if wm:
        # Смена настроек знака или самого логотипа → другое имя → копии пересоздаются.
        tag = f".wm{_MARK_STYLE}-{wm[0]}-{round(wm[1] * 100)}-{_logo_version()}"
    return os.path.join(_variant_dir(), f"{stem}.{size}{tag}.{int(st.st_mtime)}-{st.st_size}{ext}")


def _logo_version() -> int:
    try:
        return os.stat(_LOGO_PATH).st_size
    except OSError:
        return 0


@lru_cache(maxsize=1)
def _logo() -> Image.Image:
    with Image.open(_LOGO_PATH) as im:
        return im.convert("RGBA")


def _mark(logo: Image.Image, w: int) -> tuple[Image.Image, Image.Image]:
    """Логотип шириной ``w`` и его белая обводка (маска) — чтобы знак читался на любом фоне:
    на светлом виден синий логотип, на тёмном/пёстром — белый контур вокруг него."""
    h = round(logo.height * w / logo.width)
    mark = logo.resize((w, h), Image.Resampling.LANCZOS)
    alpha = mark.getchannel("A")
    r = max(1, round(w / 90))                        # толщина обводки ~1% ширины логотипа
    halo = alpha.filter(ImageFilter.MaxFilter(2 * r + 1)).filter(ImageFilter.GaussianBlur(r / 2))
    return mark, halo


def _paste_mark(img: Image.Image, mark: Image.Image, halo: Image.Image,
                pos: tuple[int, int], opacity: float) -> None:
    white = Image.new(img.mode, mark.size, (255, 255, 255, 255) if img.mode == "RGBA" else (255, 255, 255))
    img.paste(white, pos, halo.point(lambda v: round(v * opacity * 0.85)))
    img.paste(mark.convert(img.mode), pos, mark.getchannel("A").point(lambda v: round(v * opacity)))


def _apply_watermark(img: Image.Image, mode: str, opacity: float) -> Image.Image:
    """Накладывает логотип (с белой обводкой) на уже уменьшенную копию.

    ``corner`` — справа снизу, ~30% ширины; ``center`` — по центру, ~60% ширины;
    ``corners`` — пять логотипов ~25% ширины: во всех четырёх углах и по центру — ни
    обрезкой краёв, ни обрезкой центра знак не убрать. Если логотип не загрузился — копия без знака
    (в лог), но оригинал всё равно не отдаём. Слишком маленькая картинка — без знака.
    """
    try:
        logo = _logo()
    except Exception as e:  # noqa: BLE001
        log.error("media_variants: нет логотипа для водяного знака %s: %s", _LOGO_PATH, e)
        return img
    margin = max(4, round(min(img.size) * 0.03))
    share = {"center": 0.6, "corners": 0.25}.get(mode, 0.3)
    w = min(max(90, round(img.width * share)), img.width - 2 * margin)
    h = round(logo.height * w / logo.width)
    if w < 20 or h > img.height - 2 * margin:
        return img
    mark, halo = _mark(logo, w)
    if mode == "center":
        spots = [(0.5, 0.5)]
    elif mode == "corners":
        # 0/1 — прижать к краю (с отступом), см. расчёт pos ниже.
        spots = [(0, 0), (1, 0), (0, 1), (1, 1), (0.5, 0.5)]
    else:
        spots = [None]
    for spot in spots:
        if spot is None:                              # corner
            pos = (img.width - w - margin, img.height - h - margin)
        else:
            cx, cy = round(img.width * spot[0]), round(img.height * spot[1])
            pos = (min(max(margin, cx - w // 2), img.width - w - margin),
                   min(max(margin, cy - h // 2), img.height - h - margin))
        _paste_mark(img, mark, halo, pos, opacity)
    return img


def _render(src: str, dst: str, max_side: int, fmt: str,
            watermark: tuple[str, float] | None = None) -> None:
    """Делает копию ``src`` с длинной стороной не больше ``max_side`` и пишет её в ``dst``."""
    # Порядок важен для памяти: сначала уменьшаем (единственная полноразмерная копия в памяти —
    # сам декодированный оригинал), потом поворот и смена режима — уже на маленькой картинке.
    # Наоборот (exif_transpose/convert на оригинале) — 2-3 полноразмерные копии на картинку.
    with Image.open(src) as im:
        orientation = im.getexif().get(0x0112, 1)
        if im.format == "JPEG":
            # Фото с телефона бывают 48–50 Мпикс (фото владелец загружает и сам, через
            # админку). JPEG декодируем сразу уменьшенным в 2–8 раз (draft) — и лимит памяти
            # ниже проверяем уже по уменьшенному размеру. Иначе такой файл отказывал бы и
            # уходил наружу ОРИГИНАЛОМ: в полном размере, с геометкой и без логотипа.
            im.draft(im.mode, (max_side, max_side))
        if im.width * im.height > _MAX_PIXELS:
            raise ValueError(f"слишком большая картинка {im.width}x{im.height}")
        has_alpha = im.mode in ("RGBA", "LA", "PA") or (
            im.mode == "P" and "transparency" in im.info)
        if im.mode not in ("RGB", "RGBA", "L", "LA"):
            im = im.convert("RGBA" if has_alpha else "RGB")   # P/CMYK/I;16 resize не умеет нормально
        # Квадратная рамка — поворот на размер не влияет. JPEG уже уменьшен draft'ом выше,
        # для остальных thumbnail делает reduce() перед LANCZOS. Не увеличивает.
        im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        img = im.convert("RGBA" if has_alpha else "RGB")
    transpose = _ORIENTATION.get(orientation)
    if transpose is not None:
        img = img.transpose(transpose)              # поворот по EXIF; сам EXIF дальше не пишем
    if watermark:
        img = _apply_watermark(img, *watermark)
    if fmt == "JPEG" and has_alpha:
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.getchannel("A"))
        img = bg

    os.makedirs(_variant_dir(), mode=0o755, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=_variant_dir(), suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            if fmt == "JPEG":
                img.save(f, "JPEG", quality=85, optimize=True, progressive=True)
            else:
                img.save(f, "WEBP", quality=82, method=4)
        os.chmod(tmp, 0o644)
        os.replace(tmp, dst)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def get_variant(name: str, size: str, st: os.stat_result | None = None) -> str | None:
    """Путь к копии картинки нужного размера (создаёт при первом запросе).

    Args:
        name: Имя файла оригинала в медиа-каталоге.
        size: Ключ из :data:`VARIANTS`.
        st: ``os.stat`` оригинала, если уже есть.

    Returns:
        Путь к файлу копии или ``None`` — тогда отдаём оригинал (нет файла, SVG/GIF,
        ошибка обработки, перегрузка).
    """
    max_side, fmt = VARIANTS[size]
    if os.path.splitext(name)[1].lower() in _SKIP_EXT:
        return None
    src = media_path(name)
    try:
        st = st or os.stat(src)
    except OSError:
        return None
    dst = _variant_path(name, size, st)
    if os.path.isfile(dst):
        return dst

    if not _sem.acquire(timeout=_WAIT_SEC):
        log.warning("media_variants: перегрузка, отдаём оригинал %s", name)
        return None
    try:
        if not os.path.isfile(dst):   # пока ждали — мог сделать соседний запрос
            _render(src, dst, max_side, fmt, _watermark_mode(size))
        return dst
    except Exception as e:  # noqa: BLE001 — любая ошибка Pillow → оригинал, не 500
        log.warning("media_variants: не удалось сделать %s/%s: %s", name, size, e)
        return None
    finally:
        _sem.release()


def delete_variants(name: str) -> None:
    """Удаляет все копии картинки (при удалении оригинала)."""
    stem = glob.escape(os.path.splitext(os.path.basename(name))[0])
    for path in glob.glob(os.path.join(_variant_dir(), f"{stem}.*")):
        try:
            os.remove(path)
        except OSError:
            pass


def serve_image(name: str, size: str | None, request: Request, cache_control: str) -> Response | None:
    """Ответ с картинкой: копия нужного размера (если включено) или оригинал.

    Файл отдаётся потоком (``FileResponse``) либо, при ``MEDIA_ACCEL``, через nginx
    (``X-Accel-Redirect``) — в обоих случаях байты не читаются в память Python.

    Args:
        name: Имя файла оригинала.
        size: Ключ из :data:`VARIANTS` или ``None`` — всегда оригинал.
        request: Запрос (для ``If-None-Match``).
        cache_control: Значение заголовка ``Cache-Control``.

    Returns:
        :class:`Response` или ``None``, если оригинала нет (вызывающий отвечает 404).
    """
    src = media_path(name)
    try:
        st = os.stat(src)
    except OSError:
        return None
    if not os.path.isfile(src):
        return None

    target = (get_variant(name, size, st) if settings.MEDIA_VARIANTS and size else None) or src
    if target == src:
        etag = f'"{os.path.basename(src)}-{int(st.st_mtime)}-{st.st_size}"'
    else:
        etag = f'"{os.path.basename(target)}"'   # mtime/размер оригинала уже в имени копии
    headers = {"Cache-Control": cache_control, "ETag": etag}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)

    media_type = mimetypes.guess_type(target)[0] or "image/jpeg"
    if settings.MEDIA_ACCEL:
        rel = os.path.relpath(target, settings.MEDIA_DIR).replace(os.sep, "/")
        headers["X-Accel-Redirect"] = f"/_media/{rel}"
        return Response(status_code=200, headers=headers, media_type=media_type)
    return FileResponse(target, media_type=media_type, headers=headers)


def prewarm(sizes: tuple[str, ...] = ("thumb", "card", "save", "thumb_save")) -> dict[str, int]:
    """Заранее делает копии для всех фото активных товаров (последовательно, по одной).

    Запускать разово после включения ``MEDIA_VARIANTS``: иначе первые посетители после
    деплоя нагрузят процессор генерацией.
    """
    from sqlalchemy import select

    # Регистрация всех мапперов (как в conftest/migrations) — иначе Product не сконфигурируется.
    import app.db.models.admin  # noqa: F401
    import app.db.models.lead  # noqa: F401
    import app.db.models.order  # noqa: F401
    import app.db.models.promo  # noqa: F401
    import app.db.models.user  # noqa: F401
    from app.db.models.product import Product
    from app.db.session import SessionLocal

    from app.db.models.product import Category

    db = SessionLocal()
    try:
        rows = db.execute(select(Product.images, Product.image_url).where(Product.is_active == True)).all()  # noqa: E712
        icons = db.scalars(select(Category.icon).where(Category.icon.is_not(None))).all()
    finally:
        db.close()
    names = sorted({n for r in rows for n in (r.images or ([r.image_url] if r.image_url else []))})
    # Картинки категорий — те же копии card (плитка) и save (с логотипами).
    names += sorted(set(icons) - set(names))

    stats = {"files": len(names), "made": 0, "cached": 0, "fallback": 0, "missing": 0}
    for i, name in enumerate(names, 1):
        try:
            st = os.stat(media_path(name))
        except OSError:
            stats["missing"] += 1
            continue
        for size in sizes:
            existed = os.path.isfile(_variant_path(name, size, st))
            path = get_variant(name, size, st)
            if path is None:
                stats["fallback"] += 1
            elif existed:
                stats["cached"] += 1
            else:
                stats["made"] += 1
        if i % 200 == 0:
            log.warning("prewarm: %s/%s %s", i, len(names), stats)
    return stats


if __name__ == "__main__":
    if sys.argv[1:2] != ["prewarm"]:
        sys.exit("usage: python3 -m app.services.media_variants prewarm")
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    print(prewarm())

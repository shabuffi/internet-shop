"""Уменьшенные копии картинок (превью/карточка) и отдача файлов картинок.

Оригиналы из обмена весят ~1 MB (до 4.4 MB, PNG до 4032px) — наружу их больше не отдаём:
по запросу делаем копию нужного размера без EXIF (поворот применяем, метаданные и геометку
выкидываем) и кладём в кэш на томе (``MEDIA_DIR/_v``). Копия создаётся один раз при первом
запросе (или заранее: ``python3 -m app.services.media_variants prewarm`` — заодно удаляет
устаревшие копии, см. :func:`cleanup_stale`; только очистка — ``… cleanup``).

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
import re
import logging
import mimetypes
import os
import sys
import tempfile
import threading
import time
from urllib.parse import quote
from functools import lru_cache

from fastapi import Request
from fastapi.responses import FileResponse, Response
from PIL import Image, ImageChops, ImageFilter, ImageStat

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
    # Невидимый слой «для сохранения» поверх фото на карточке. JPEG, а не WebP: сохранённый
    # файл должен открываться везде (старые просмотрщики Windows WebP не знают), и в нём
    # же — подпись об авторских правах (EXIF/XMP).
    "save": (1200, "JPEG"),
    # Невидимый слой поверх превью (каталог, «Новинки»/промо, список, корзина, миниатюры):
    # того же размера, что thumb, — иначе каждая карточка тянула бы ещё и 1200px.
    "thumb_save": (500, "JPEG"),
    "media": (1920, "WEBP"),   # баннеры/бренды/иконки (/admin/media/{name})
    # Картинка раздела на плитке: как card, но без видимого знака (решение владельца —
    # знак только на фото товаров). При сохранении — копия save с логотипами, как у товаров.
    "cat": (900, "WEBP"),
}
VARIANT_DIR = "_v"
# Размеры фото товаров — на них ставится водяной знак (media — баннеры/бренды/иконки — без).
WATERMARKED = {"thumb", "card", "og", "save", "thumb_save"}
# Копии «для сохранения» — со знаком MEDIA_WATERMARK_SAVE (остальные — MEDIA_WATERMARK).
SAVE_SIZES = {"save", "thumb_save"}
# Версия оформления знака: входит в имя копии — менять при смене рисования.
_MARK_STYLE = 8
_ASSETS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
# Логотип (шестерёнка с домиком, «ИНЖЕНЕР», «ТОРГОВЫЙ ДОМ» с линиями) — = frontend/public/logo.png.
# Видимый знак — его серая форма, скачанные копии — он сам в цветах бренда (макет владельца).
_LOGO_PATH = os.path.join(_ASSETS, "watermark.png")
# Значок вкладки (шестерёнка с домиком на белом круге) — вариант видимого знака «icon».
_ICON_PATH = os.path.join(_ASSETS, "watermark-icon.png")

# Не обрабатываем: SVG — вектор, GIF — может быть анимацией (копия её бы убила).
_SKIP_EXT = {".svg", ".gif"}
# Оригиналы, у которых бывают копии (для очистки кэша).
_RASTER_EXT = {".png", ".jpg", ".jpeg", ".webp"}
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


def _watermark_mode(size: str) -> tuple[str, float, str] | None:
    """Знак для этого размера: (расположение, непрозрачность, ``logo``/``icon``) или ``None``.

    Копии «для сохранения» — логотип в цветах бренда (``brand``); видимые — ``MEDIA_WATERMARK_MARK``
    (``logo`` — серый логотип, по умолчанию; ``icon`` — только значок).
    Маленькие превью (``thumb``) — без видимого знака, если не включён ``MEDIA_WATERMARK_THUMB``.
    """
    if size not in WATERMARKED:
        return None
    if size == "thumb" and not settings.MEDIA_WATERMARK_THUMB:
        return None                     # маленькие превью каталога — без видимого знака
    if size in SAVE_SIZES:
        mode, opacity, kind = settings.MEDIA_WATERMARK_SAVE, settings.MEDIA_WATERMARK_SAVE_OPACITY, "brand"
    else:
        mode, opacity = settings.MEDIA_WATERMARK, settings.MEDIA_WATERMARK_OPACITY
        kind = "logo" if settings.MEDIA_WATERMARK_MARK == "logo" else "icon"
    if mode not in ("corner", "bottom", "center", "corners", "object"):
        return None
    return mode, min(max(opacity, 0.0), 1.0), kind


def _variant_path(name: str, size: str, st: os.stat_result) -> str:
    stem = os.path.splitext(os.path.basename(name))[0]
    ext = ".jpg" if VARIANTS[size][1] == "JPEG" else ".webp"
    tag = ""
    wm = _watermark_mode(size)
    if wm:
        # Смена настроек знака или самого логотипа → другое имя → копии пересоздаются.
        tag = f".wm{_MARK_STYLE}-{wm[2]}-{wm[0]}-{round(wm[1] * 100)}-{_asset_version(wm[2])}"
        if size not in SAVE_SIZES and wm[0] in ("corner", "bottom"):
            tag += f"-s{round(settings.MEDIA_WATERMARK_SIZE * 100)}"     # размер видимого знака
    return os.path.join(_variant_dir(), f"{stem}.{size}{tag}.{int(st.st_mtime)}-{st.st_size}{ext}")


def _asset_version(kind: str) -> int:
    """Версия картинки знака (входит в имя копии): размер файла."""
    try:
        return os.stat(_ICON_PATH if kind == "icon" else _LOGO_PATH).st_size
    except OSError:
        return 0


@lru_cache(maxsize=1)
def _icon() -> Image.Image:
    with Image.open(_ICON_PATH) as im:
        return im.convert("RGBA")


def _shape(im: Image.Image) -> Image.Image:
    """Маска формы: альфа × (1 − белизна) — белые детали (домик, белый круг) становятся «окнами»."""
    whiteness = im.convert("L").point(lambda v: 0 if v < 200 else round((v - 200) * 255 / 55))
    return ImageChops.subtract(im.getchannel("A"), whiteness)


@lru_cache(maxsize=1)
def _logo_images() -> tuple[Image.Image, Image.Image]:
    """Логотип для знака: (маска формы L, цветной RGBA), обрезанные по содержимому.

    Маска — для серого видимого знака и белой версии на тёмном фоне (белые детали — домик —
    остаются «окнами»); цветной — для скачанных копий на светлых участках.
    """
    with Image.open(_LOGO_PATH) as im:
        color = im.convert("RGBA")
    shape = _shape(color)
    box = shape.getbbox()
    return (shape.crop(box), color.crop(box)) if box else (shape, color)


def _tone_for(img: Image.Image, box: tuple[int, int, int, int]) -> tuple[int, int, int]:
    """Цвет одноцветного знака под конкретный участок фото: на светлом — тёмно-серый,
    на тёмном — белый. Прозрачные пиксели считаем белыми (так их и видно на странице)."""
    part = img.crop(box)
    if part.mode == "RGBA":
        flat = Image.new("RGB", part.size, (255, 255, 255))
        flat.paste(part, mask=part.getchannel("A"))
        part = flat
    lum = ImageStat.Stat(part.convert("L")).mean[0]
    return (34, 34, 38) if lum > 140 else (255, 255, 255)


def _soft_shadow(img: Image.Image, mask: Image.Image, pos: tuple[int, int], opacity: float) -> None:
    """Еле заметная тень под белым знаком — чтобы он ровно читался и на пёстром/смешанном фоне
    (а не наполовину). Не «ореол»: тёмная, размытая, ~30% от прозрачности знака."""
    r = max(1, round(mask.height / 18))
    pad = r * 3
    big = Image.new("L", (mask.width + 2 * pad, mask.height + 2 * pad), 0)
    big.paste(mask, (pad, pad))
    shadow = big.filter(ImageFilter.GaussianBlur(r)).point(lambda v: round(v * opacity * 0.3))
    black = Image.new(img.mode, shadow.size, (0, 0, 0, 255) if img.mode == "RGBA" else (0, 0, 0))
    img.paste(black, (pos[0] - pad, pos[1] - pad + max(1, r // 2)), shadow)


def _paste_mark(img: Image.Image, mark: Image.Image, pos: tuple[int, int], opacity: float) -> None:
    """Вставляет цветной знак (значок или логотип в цветах бренда) с заданной прозрачностью."""
    img.paste(mark.convert(img.mode), pos, mark.getchannel("A").point(lambda v: round(v * opacity)))


def _object_box(img: Image.Image) -> tuple[int, int, int, int] | None:
    """Границы самого товара на фото (всё, что отличается от фона по краям) или ``None``,
    если однотонного фона нет (фото «в край»).

    Прозрачный PNG — по альфе. Иначе фон = цвет, общий хотя бы для трёх углов (товар может
    упираться в один угол), товар — пиксели, заметно отличающиеся от него (мелкий шум/артефакты
    сжатия отсекаем MinFilter).
    """
    if "A" in img.getbands():
        alpha = img.getchannel("A")
        if max(alpha.getpixel(c) for c in ((0, 0), (img.width - 1, img.height - 1))) < 16:
            return alpha.point(lambda v: 255 if v > 16 else 0).getbbox()
    rgb = img.convert("RGB")
    corners = [rgb.getpixel(c) for c in ((1, 1), (img.width - 2, 1),
                                         (1, img.height - 2), (img.width - 2, img.height - 2))]
    near = lambda a, b: max(abs(x - y) for x, y in zip(a, b)) <= 40
    # Фон — цвет, общий хотя бы для трёх углов из четырёх: товар может упираться в один угол.
    same = [c for c in corners if sum(near(c, o) for o in corners) >= 3]
    if not same:
        return None                                    # углы разные — однотонного фона нет
    bg = Image.new("RGB", rgb.size, tuple(sorted(ch)[len(ch) // 2] for ch in zip(*same)))
    mask = ImageChops.difference(rgb, bg).convert("L").point(lambda v: 255 if v > 28 else 0)
    box = mask.filter(ImageFilter.MinFilter(5)).getbbox()
    if box is None:
        return None
    l, t, r, b = box
    if (r - l) * (b - t) > 0.9 * img.width * img.height:
        return None                                    # товар на всё фото — как «в край»
    return box


def _apply_watermark(img: Image.Image, mode: str, opacity: float, kind: str = "logo") -> Image.Image:
    """Накладывает знак на уже уменьшенную копию.

    ``kind``:
      * ``logo`` — серая форма логотипа (:func:`_logo_images`), тон под фон — видимый знак;
      * ``brand`` — тот же логотип в цветах бренда (копии «для сохранения»: их видит только
        тот, кто сохранил фото). На тёмном участке — белым, иначе синий пропадает;
      * ``icon`` — только значок (иконка вкладки, на белом круге).

    ``mode``: ``corner`` — внизу в свободном углу (справа; если там товар — слева; знак не
    «разрезается» краем товара, см. :func:`_corner_spot`); ``bottom`` — снизу по центру (обрезать можно только
    всю нижнюю полосу); ``center`` — по центру; ``corners`` — во всех четырёх углах и по центру;
    ``object`` — в правом нижнем углу самого товара (фото «в край» — отступ ~10%).
    Нет картинки знака — копия без знака (в лог), но оригинал всё равно не отдаём.
    Слишком маленькая картинка — без знака.
    """
    icon, brand = kind == "icon", kind == "brand"
    try:
        if icon:
            logo = _icon()
        else:
            shape_full, color_full = _logo_images()
            logo = shape_full
    except Exception as e:  # noqa: BLE001
        log.error("media_variants: нет картинки для водяного знака: %s", e)
        return img
    margin = max(4, round(min(img.size) * 0.03))
    if icon:
        share, min_w = {"center": 0.25, "corners": 0.1}.get(mode, 0.12), 32
    else:
        # Видимый знак — небольшой (рекомендации для товарных фото: «меньше и светлее, чем
        # кажется нужным»); копия «для сохранения» (corners) — крупнее, подпись читается.
        share = {"center": 0.45, "corners": 0.24, "object": 0.2}.get(mode)
        if share is None:                                   # corner / bottom — видимый знак
            share = min(max(settings.MEDIA_WATERMARK_SIZE, 0.05), 0.6)
        min_w = 70
    w = min(max(min_w, round(img.width * share)), img.width - 2 * margin)
    h = round(logo.height * w / logo.width)
    if w < 20 or h > img.height - 2 * margin:
        return img
    inset = max(margin, round(min(img.size) * 0.04))       # от края — чуть дальше, аккуратнее
    if mode == "corner" and not icon:                       # свободный угол, без «разреза»
        pos0, w = _corner_spot(img, w, round(logo.height * w / logo.width), inset, margin)
        h = round(logo.height * w / logo.width)
    mark = logo.resize((w, h), Image.Resampling.LANCZOS)
    color = color_full.resize((w, h), Image.Resampling.LANCZOS) if brand else None

    if mode == "object":
        box = _object_box(img)
        if box is None:                                     # фото «в край»: отступ ~10%
            k = round(min(img.size) * 0.10)
            spots = [(img.width - w - k, img.height - h - k)]
        else:                                               # правый нижний угол самого товара
            l, t, r, b = box
            k = round(min(r - l, b - t) * 0.06)
            spots = [(r - k - w, b - k - h)]
    elif mode == "bottom":
        spots = [((img.width - w) // 2, img.height - h - inset)]
    elif mode in ("center", "corners"):
        rel = [(0.5, 0.5)] if mode == "center" else [(0, 0), (1, 0), (0, 1), (1, 1), (0.5, 0.5)]
        spots = [(round(img.width * x) - w // 2, round(img.height * y) - h // 2) for x, y in rel]
    elif not icon:                                          # corner — уже выбран выше
        spots = [pos0]
    else:                                                   # corner для значка
        spots = [(img.width - w - inset, img.height - h - inset)]

    for x, y in spots:
        pos = (min(max(margin, x), img.width - w - margin), min(max(margin, y), img.height - h - margin))
        if icon:
            _paste_mark(img, mark, pos, opacity)
            continue
        tone = _tone_for(img, (pos[0], pos[1], pos[0] + w, pos[1] + h))
        if brand and tone != (255, 255, 255):               # светлый участок — цвета бренда
            _paste_mark(img, color, pos, opacity)
            continue
        if tone == (255, 255, 255):
            _soft_shadow(img, mark, pos, opacity)
        fill = Image.new(img.mode, (w, h), tone + ((255,) if img.mode == "RGBA" else ()))
        img.paste(fill, pos, mark.point(lambda v: round(v * opacity)))
    return img


def _corner_spot(img: Image.Image, w: int, h: int, inset: int, margin: int) -> tuple[tuple[int, int], int]:
    """Где поставить знак «в углу» и какой ширины: ``((x, y), w)``.

    * Сначала правый нижний угол, если там не товар; иначе левый нижний.
    * Если товар задевает оба угла — знак не «разрезаем» краем товара: либо уменьшаем
      (до 60%) и ставим целиком на фон сбоку, либо кладём целиком на товар.
    * Фото без однотонного фона — угол, где спокойнее (меньше деталей).
    """
    y = img.height - h - inset
    right, left = (img.width - w - inset, y), (inset, y)
    box = _object_box(img)
    if box is None:
        lum = img.convert("L")
        busy = lambda p: ImageStat.Stat(lum.crop((p[0], p[1], p[0] + w, p[1] + h))).stddev[0]
        return (left if busy(left) < 0.7 * busy(right) else right), w
    pad = max(2, round(min(img.size) * 0.015))
    l, t, r, b = box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad
    hits = lambda p: not (p[0] + w <= l or p[0] >= r or p[1] + h <= t or p[1] >= b)
    for p in (right, left):
        if not hits(p):
            return p, w
    free_r, free_l = img.width - r - margin, l - margin      # поля фона справа/слева от товара
    side = max(free_r, free_l)
    if side >= 0.6 * w and b - t > h:                          # уменьшить и поставить на фон
        w2 = min(w, side)
        h2 = round(h * w2 / w)
        x = img.width - w2 - margin if free_r >= free_l else margin
        return (x, min(img.height - h2 - inset, b - h2)), w2
    k = round(min(r - l, b - t) * 0.06)                        # целиком на товар, его правый низ
    return (min(max(margin, r - k - w), img.width - w - margin),
            min(max(margin, b - k - h), img.height - h - margin)), w


_TRANSLIT = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
                     ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p",
                      "r", "s", "t", "u", "f", "kh", "ts", "ch", "sh", "shch", "", "y", "", "e", "yu", "ya"]))


def translit(text: str) -> str:
    """Кириллица → латиница (для имени файла и ASCII-поля EXIF)."""
    out = []
    for c in text:
        t = _TRANSLIT.get(c.lower())
        out.append(c if t is None else (t.capitalize() if c != c.lower() else t))
    return "".join(out)


def download_name(title: str | None) -> str:
    """Имя файла для «Сохранить картинку»: ``td-engineer-<название>.jpg`` (латиницей)."""
    slug = re.sub(r"[^a-z0-9]+", "-", translit(title or "").lower()).strip("-")[:60].rstrip("-")
    return f"td-engineer-{slug}.jpg" if slug else "td-engineer.jpg"


def _copyright_meta() -> dict[str, bytes]:
    """Подпись об авторских правах в сохранённом файле: EXIF (только ASCII — латиницей) и XMP
    (UTF-8 — по-русски). Не видна, но помогает доказать авторство при жалобе на площадку."""
    text = settings.MEDIA_COPYRIGHT
    ascii_text = translit(text).replace("©", "(c)").replace("«", '"').replace("»", '"')
    ascii_text = ascii_text.encode("ascii", "ignore").decode()
    exif = Image.Exif()
    exif[0x8298] = ascii_text                 # Copyright
    exif[0x013B] = ascii_text                 # Artist
    esc = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    xmp = ('<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>'
           '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
           '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" '
           'xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/">'
           f'<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">{esc}</rdf:li></rdf:Alt></dc:rights>'
           f'<dc:creator><rdf:Seq><rdf:li>{esc}</rdf:li></rdf:Seq></dc:creator>'
           '<xmpRights:Marked>True</xmpRights:Marked>'
           '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>')
    return {"exif": exif.tobytes(), "xmp": xmp.encode("utf-8")}


def _render(src: str, dst: str, max_side: int, fmt: str,
            watermark: tuple[str, float, str] | None = None, copyright_meta: bool = False) -> None:
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
    if fmt == "JPEG" and has_alpha:                 # до знака: тон знака — по итоговому белому фону
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.getchannel("A"))
        img = bg
    if watermark:
        img = _apply_watermark(img, *watermark)

    os.makedirs(_variant_dir(), mode=0o755, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=_variant_dir(), suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            if fmt == "JPEG":
                extra = _copyright_meta() if copyright_meta else {}
                img.save(f, "JPEG", quality=85, optimize=True, progressive=True, **extra)
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
            _render(src, dst, max_side, fmt, _watermark_mode(size), copyright_meta=size in SAVE_SIZES)
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


def serve_image(name: str, size: str | None, request: Request, cache_control: str,
                filename: str | None = None) -> Response | None:
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
    if filename and target != src:
        # «Сохранить картинку» предложит это имя (td-engineer-<товар>.jpg), а не «image».
        headers["Content-Disposition"] = f'inline; filename="{filename}"; filename*=UTF-8\'\'{quote(filename)}'
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
    from app.db.models.product import Category, Product
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        rows = db.execute(select(Product.images, Product.image_url).where(Product.is_active == True)).all()  # noqa: E712
        icons = db.scalars(select(Category.icon).where(Category.icon.is_not(None))).all()
    finally:
        db.close()
    products = sorted({n for r in rows for n in (r.images or ([r.image_url] if r.image_url else []))})
    # Картинки разделов — свои копии: cat (плитка, без видимого знака) и save (с логотипами).
    jobs = [(n, sizes) for n in products] + [(n, ("cat", "save")) for n in sorted(set(icons) - set(products))]

    stats = {"files": len(jobs), "made": 0, "cached": 0, "fallback": 0, "missing": 0}
    for i, (name, name_sizes) in enumerate(jobs, 1):
        try:
            st = os.stat(media_path(name))
        except OSError:
            stats["missing"] += 1
            continue
        for size in name_sizes:
            existed = os.path.isfile(_variant_path(name, size, st))
            path = get_variant(name, size, st)
            if path is None:
                stats["fallback"] += 1
            elif existed:
                stats["cached"] += 1
            else:
                stats["made"] += 1
        if i % 200 == 0:
            log.warning("prewarm: %s/%s %s", i, len(jobs), stats)
    return stats


_TMP_MAX_AGE = 3600   # недописанный .tmp старше часа — остаток упавшей записи


def cleanup_stale() -> dict[str, int]:
    """Удаляет из кэша копии, которые больше не нужны, — только внутри ``MEDIA_DIR/_v``.

    Копия «нужна», если её имя совпадает с тем, что :func:`_variant_path` выдал бы сейчас для
    существующего оригинала. Значит, удаляются: копии от прежних настроек знака (размер, место,
    прозрачность, логотип), от прежней версии файла (фото заменили под тем же именем), копии
    удалённых оригиналов и недописанные ``.tmp`` старше часа. Оригиналы не трогаются никогда.

    Запускать с теми же настройками (env), что и у работающего backend, — иначе актуальные
    копии будут признаны устаревшими (они просто пересоздадутся при показе, но зря).
    """
    vdir = os.path.realpath(_variant_dir())
    stats = {"kept": 0, "removed": 0, "freed_mb": 0}
    if not os.path.isdir(vdir):
        return stats
    expected = set()
    for name in os.listdir(settings.MEDIA_DIR):
        src = media_path(name)
        if not os.path.isfile(src) or os.path.splitext(name)[1].lower() not in _RASTER_EXT:
            continue
        st = os.stat(src)
        expected.update(os.path.basename(_variant_path(name, size, st)) for size in VARIANTS)
    now, freed = time.time(), 0
    for entry in os.scandir(vdir):
        if not entry.is_file(follow_symlinks=False):
            continue
        if entry.name.endswith(".tmp"):
            stale = now - entry.stat().st_mtime > _TMP_MAX_AGE
        else:
            stale = entry.name not in expected
        if not stale:
            stats["kept"] += 1
            continue
        path = os.path.realpath(entry.path)
        if os.path.dirname(path) != vdir:          # только файлы прямо в _v — на всякий случай
            continue
        try:
            freed += entry.stat().st_size
            os.remove(path)
            stats["removed"] += 1
        except OSError:
            pass
    stats["freed_mb"] = round(freed / 1e6)
    return stats


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd not in (["prewarm"], ["cleanup"]):
        sys.exit("usage: python3 -m app.services.media_variants prewarm|cleanup")
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    if cmd == ["prewarm"]:
        print(prewarm())       # сначала сделать актуальные копии…
    print(cleanup_stale())     # …потом убрать устаревшие

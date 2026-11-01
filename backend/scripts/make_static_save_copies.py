"""Копии с водяным знаком для статических картинок витрины.

Встроенные картинки разделов (``frontend/public/categories/*.jpg``, старый режим плиток
«Популярные разделы») отдаёт Next.js как статику — бэкенд их не обрабатывает. Поверх них на
главной лежит невидимый слой с копией из ``public/categories/save/`` (как у фото товаров),
и эти копии делаются этим скриптом тем же кодом водяного знака, что и на бэкенде.

Перезапускать при смене логотипа (``app/assets/watermark.png``) или картинок разделов::

    docker compose cp frontend/public/categories backend:/tmp/cats
    docker compose exec -T backend sh -c \
        'cd /app && PYTHONPATH=/app python3 scripts/make_static_save_copies.py /tmp/cats /tmp/save'
    docker compose cp backend:/tmp/save/. frontend/public/categories/save/

(``/tmp/save``, а не внутри ``/tmp/cats``: docker cp кладёт файлы от root, а backend — appuser.)

С ``--visible`` делает видимые версии (маленький значок в правом нижнем углу — как
``MEDIA_WATERMARK=corner`` для фото товаров) → ``frontend/public/categories/wm/``::

    docker compose exec -T backend sh -c \
        'cd /app && PYTHONPATH=/app python3 scripts/make_static_save_copies.py /tmp/cats /tmp/wm --visible'
    docker compose cp backend:/tmp/wm/. frontend/public/categories/wm/
"""

import os
import sys

from PIL import Image

from app.services import media_variants as mv

SAVE = ("corners", 0.45, "logo")     # как копии «для сохранения» (MEDIA_WATERMARK_SAVE)
VISIBLE = ("corner", 0.85, "icon")   # как видимый знак на сайте (MEDIA_WATERMARK + _MARK=icon)


def main(src: str, dst: str, visible: bool = False) -> None:
    mode, opacity, kind = VISIBLE if visible else SAVE
    os.makedirs(dst, exist_ok=True)
    for name in sorted(os.listdir(src)):
        if not name.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            continue
        with Image.open(os.path.join(src, name)) as im:
            has_alpha = "A" in im.getbands()
            img = im.convert("RGBA" if has_alpha else "RGB")   # EXIF дальше не пишем
        img = mv._apply_watermark(img, mode, opacity, kind)
        out = os.path.join(dst, name)
        if name.lower().endswith(".png"):
            img.save(out, "PNG", optimize=True)
        else:
            img.convert("RGB").save(out, "JPEG", quality=85, optimize=True, progressive=True)
        print(name, img.size)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--visible"]
    if len(args) != 2:
        sys.exit("usage: make_static_save_copies.py <src_dir> <dst_dir> [--visible]")
    main(args[0], args[1], visible="--visible" in sys.argv)

"""Копии «для сохранения» (с логотипами) для статических картинок витрины.

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
"""

import os
import sys

from PIL import Image

from app.services import media_variants as mv

MODE, OPACITY = "corners", 0.45      # как MEDIA_WATERMARK_SAVE / _SAVE_OPACITY по умолчанию


def main(src: str, dst: str) -> None:
    os.makedirs(dst, exist_ok=True)
    for name in sorted(os.listdir(src)):
        if not name.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            continue
        with Image.open(os.path.join(src, name)) as im:
            has_alpha = "A" in im.getbands()
            img = im.convert("RGBA" if has_alpha else "RGB")   # EXIF дальше не пишем
        img = mv._apply_watermark(img, MODE, OPACITY)
        out = os.path.join(dst, name)
        if name.lower().endswith(".png"):
            img.save(out, "PNG", optimize=True)
        else:
            img.convert("RGB").save(out, "JPEG", quality=85, optimize=True, progressive=True)
        print(name, img.size)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: make_static_save_copies.py <src_dir> <dst_dir>")
    main(sys.argv[1], sys.argv[2])

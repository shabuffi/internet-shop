"""Тесты уменьшенных копий картинок (media_variants) и их отдачи.

Проверяем ровно то, на чём раньше были инциденты с фото: замена фото не «залипает»,
битый файл не даёт 500, оригиналы не утекают через публичные эндпоинты.
"""

import io
import os
from decimal import Decimal

import pytest
from PIL import Image

import app.services.media_storage as media
import app.services.media_variants as mv
from app.core.config import settings
from app.db.models.product import Product


def _png(size=(2000, 1000), color=(200, 30, 30, 255), mode="RGBA") -> bytes:
    buf = io.BytesIO()
    Image.new(mode, size, color).save(buf, "PNG")
    return buf.getvalue()


def _jpeg_rotated(size=(400, 200)) -> bytes:
    """JPEG с EXIF Orientation=6 (повернуть на 90°) и полем Make — как фото с телефона."""
    img = Image.new("RGB", size, (10, 120, 200))
    exif = Image.Exif()
    exif[0x0112] = 6
    exif[0x010F] = "Apple"
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif.tobytes())
    return buf.getvalue()


def _open(path) -> Image.Image:
    im = Image.open(path)
    im.load()
    return im


@pytest.fixture
def variants_on(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_VARIANTS", True)


def _product(db, name="p.png", pid="v1", images=None):
    db.add(Product(id=pid, moysklad_id=f"ms-{pid}", name="T", article="A",
                   price=Decimal("10"), stock=1, image_url=name, images=images or [name]))
    db.commit()


# ─── сама копия ──────────────────────────────────────────────────────────────

def test_variant_downsizes_keeping_aspect():
    media.save_image("big.png", _png((2000, 1000)))
    im = _open(mv.get_variant("big.png", "thumb"))
    assert im.format == "WEBP"
    assert im.size == (500, 250)


def test_variant_never_upscales():
    media.save_image("small.png", _png((120, 80)))
    assert _open(mv.get_variant("small.png", "card")).size == (120, 80)


def test_variant_applies_exif_rotation_and_strips_exif():
    media.save_image("phone.jpg", _jpeg_rotated((400, 200)))
    im = _open(mv.get_variant("phone.jpg", "card"))
    assert im.size == (200, 400)            # поворот применён
    assert not im.getexif()                  # EXIF (камера/геометка) не попал в копию


@pytest.mark.parametrize("orientation", range(1, 9))
def test_variant_rotation_matches_exif_transpose(orientation):
    """Свой поворот (на уменьшенной копии) = эталонный ImageOps.exif_transpose для всех 8."""
    from PIL import ImageOps

    def red_center(im):
        # Центр красной метки — WebP с потерями размывает края, поэтому сравниваем положение.
        px = [(x, y) for x in range(im.width) for y in range(im.height)
              if (lambda p: p[0] > 180 and p[1] < 90 and p[2] < 90)(im.getpixel((x, y)))]
        return (sum(x for x, _ in px) / len(px), sum(y for _, y in px) / len(px))

    img = Image.new("RGB", (300, 150), (255, 255, 255))
    img.paste((255, 0, 0), (0, 0, 60, 40))          # метка в углу — видно поворот/отражение
    exif = Image.Exif()
    exif[0x0112] = orientation
    buf = io.BytesIO()
    img.save(buf, "PNG", exif=exif.tobytes())
    media.save_image("o.png", buf.getvalue())
    ref = ImageOps.exif_transpose(Image.open(io.BytesIO(buf.getvalue()))).convert("RGB")
    got = _open(mv.get_variant("o.png", "card")).convert("RGB")
    assert got.size == ref.size
    (gx, gy), (rx, ry) = red_center(got), red_center(ref)
    assert abs(gx - rx) < 3 and abs(gy - ry) < 3


def test_variant_keeps_transparency():
    media.save_image("alpha.png", _png((800, 800), (0, 0, 0, 0)))
    im = _open(mv.get_variant("alpha.png", "thumb"))
    assert im.mode == "RGBA"
    assert im.getchannel("A").getextrema() == (0, 0)


def test_og_variant_is_jpeg_on_white():
    media.save_image("alpha.png", _png((800, 800), (0, 0, 0, 0)))
    im = _open(mv.get_variant("alpha.png", "og"))
    assert im.format == "JPEG"
    assert im.getpixel((10, 10)) == (255, 255, 255)


def test_palette_png_with_transparency():
    img = Image.new("P", (600, 300))
    img.info["transparency"] = 0
    buf = io.BytesIO()
    img.save(buf, "PNG", transparency=0)
    media.save_image("pal.png", buf.getvalue())
    im = _open(mv.get_variant("pal.png", "thumb"))
    assert im.mode == "RGBA" and im.size == (500, 250)


def test_variant_files_readable_by_nginx():
    media.save_image("big.png", _png())
    path = mv.get_variant("big.png", "thumb")
    assert os.stat(path).st_mode & 0o777 == 0o644
    assert not [f for f in os.listdir(os.path.dirname(path)) if f.endswith(".tmp")]


def test_broken_file_falls_back_to_none():
    media.save_image("broken.png", b"\x89PNG not really")
    assert mv.get_variant("broken.png", "thumb") is None


def test_svg_and_gif_not_processed():
    media.save_image("logo.svg", b"<svg xmlns='http://www.w3.org/2000/svg'/>")
    assert mv.get_variant("logo.svg", "media") is None


def test_overload_falls_back_to_original(monkeypatch):
    media.save_image("big.png", _png())
    monkeypatch.setattr(mv, "_WAIT_SEC", 0)
    held = [mv._sem.acquire() for _ in range(mv._MAX_PARALLEL)]
    try:
        assert mv.get_variant("big.png", "thumb") is None
    finally:
        for _ in held:
            mv._sem.release()


def test_delete_image_removes_variants():
    media.save_image("big.png", _png())
    path = mv.get_variant("big.png", "thumb")
    media.delete_image("big.png")
    assert not os.path.exists(path)


def test_variant_dir_is_not_an_image_name():
    # Админская библиотека «бесхозных» и диагностика фильтруют по расширению — папка копий
    # не должна выглядеть как картинка.
    assert not media.is_image_filename(mv.VARIANT_DIR)


# ─── эндпоинт товара ─────────────────────────────────────────────────────────

def test_product_image_serves_thumb(client, db_session, variants_on):
    media.save_image("p.png", _png((2000, 1000)))
    _product(db_session)
    r = client.get("/api/v1/products/v1/image?size=thumb")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/webp"
    assert Image.open(io.BytesIO(r.content)).size == (500, 250)


def test_product_image_default_is_card_not_original(client, db_session, variants_on):
    media.save_image("p.png", _png((2000, 1000)))
    _product(db_session)
    r = client.get("/api/v1/products/v1/image")
    assert Image.open(io.BytesIO(r.content)).size == (1200, 600)


def test_product_image_flag_off_serves_original(client, db_session):
    data = _png((2000, 1000))
    media.save_image("p.png", data)
    _product(db_session)
    r = client.get("/api/v1/products/v1/image?size=thumb")
    assert r.status_code == 200 and r.content == data


def test_product_image_unknown_size_422(client, db_session, variants_on):
    media.save_image("p.png", _png())
    _product(db_session)
    assert client.get("/api/v1/products/v1/image?size=original").status_code == 422


def test_product_image_broken_file_serves_original(client, db_session, variants_on):
    media.save_image("p.png", b"\x89PNG broken")
    _product(db_session)
    r = client.get("/api/v1/products/v1/image?size=thumb")
    assert r.status_code == 200 and r.content == b"\x89PNG broken"


def test_product_image_304_on_same_etag(client, db_session, variants_on):
    media.save_image("p.png", _png())
    _product(db_session)
    etag = client.get("/api/v1/products/v1/image?size=thumb").headers["etag"]
    r = client.get("/api/v1/products/v1/image?size=thumb", headers={"If-None-Match": etag})
    assert r.status_code == 304


def test_replaced_photo_same_name_changes_etag(client, db_session, variants_on):
    """Инцидент «залипшего» фото: новый файл под тем же именем → новый ETag и новая копия."""
    media.save_image("p.png", _png(color=(255, 0, 0, 255)))
    _product(db_session)
    r1 = client.get("/api/v1/products/v1/image?size=thumb")
    path = media.media_path("p.png")
    media.save_image("p.png", _png((2000, 1000), (0, 0, 255, 255)) + b"\0")
    st = os.stat(path)
    os.utime(path, (st.st_atime, st.st_mtime + 5))
    r2 = client.get("/api/v1/products/v1/image?size=thumb",
                    headers={"If-None-Match": r1.headers["etag"]})
    assert r2.status_code == 200
    assert r2.headers["etag"] != r1.headers["etag"]
    assert Image.open(io.BytesIO(r2.content)).convert("RGB").getpixel((5, 5))[2] > 200


def test_product_image_missing_file_404(client, db_session, variants_on):
    _product(db_session, name="nofile.png")
    assert client.get("/api/v1/products/v1/image?size=thumb").status_code == 404


def test_product_image_x_accel(client, db_session, variants_on, monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_ACCEL", True)
    media.save_image("p.png", _png())
    _product(db_session)
    r = client.get("/api/v1/products/v1/image?size=thumb")
    assert r.status_code == 200
    assert r.headers["x-accel-redirect"].startswith("/_media/_v/p.thumb.")
    assert r.headers["content-type"] == "image/webp"
    assert r.content == b""


# ─── публичный /admin/media/{name} (баннеры/бренды/иконки) ───────────────────

def test_admin_media_does_not_leak_product_original(client, variants_on):
    """Имена фото товаров видны в публичном /products — оригинал отсюда не должен уходить."""
    data = _png((3000, 1500))
    media.save_image("product.png", data)
    r = client.get("/api/v1/admin/media/product.png")
    assert r.status_code == 200
    assert r.content != data
    assert Image.open(io.BytesIO(r.content)).size == (1920, 960)


def test_admin_media_svg_served_as_is(client, variants_on):
    svg = b"<svg xmlns='http://www.w3.org/2000/svg'/>"
    media.save_image("icon.svg", svg)
    r = client.get("/api/v1/admin/media/icon.svg")
    assert r.status_code == 200 and r.content == svg


def test_admin_media_non_image_404(client):
    media.save_image("images_1.json", b"{}")
    assert client.get("/api/v1/admin/media/images_1.json").status_code == 404


# ─── водяной знак (логотип) ──────────────────────────────────────────────────

def _white(size=(1200, 800)) -> bytes:
    return _png(size, (255, 255, 255, 255))


def _region_changed(im, box) -> bool:
    return im.convert("RGB").crop(box).getextrema() != ((255, 255), (255, 255), (255, 255))


def test_watermark_corner(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    media.save_image("w.png", _white())
    im = _open(mv.get_variant("w.png", "card"))
    assert im.size == (1200, 800)
    assert _region_changed(im, (800, 650, 1200, 800))      # логотип справа снизу
    assert not _region_changed(im, (0, 0, 600, 400))       # слева сверху — чисто


def test_watermark_center(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "center")
    media.save_image("w.png", _white())
    im = _open(mv.get_variant("w.png", "card"))
    assert _region_changed(im, (500, 350, 700, 450))
    assert not _region_changed(im, (0, 0, 150, 150))


def test_watermark_on_all_product_sizes_not_on_media(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    media.save_image("w.png", _white())
    for size in ("thumb", "card", "og"):
        im = _open(mv.get_variant("w.png", size))
        assert _region_changed(im, (im.width // 2, im.height // 2, im.width, im.height)), size
    banner = _open(mv.get_variant("w.png", "media"))
    assert not _region_changed(banner, (0, 0, banner.width, banner.height))


def test_watermark_off_by_default():
    media.save_image("w.png", _white())
    im = _open(mv.get_variant("w.png", "card"))
    assert not _region_changed(im, (0, 0, im.width, im.height))


def test_watermark_settings_change_variant_name(monkeypatch):
    """Смена расположения/прозрачности → новые копии, а не старые закэшированные."""
    media.save_image("w.png", _white())
    plain = mv.get_variant("w.png", "card")
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    corner = mv.get_variant("w.png", "card")
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_OPACITY", 0.7)
    stronger = mv.get_variant("w.png", "card")
    assert len({plain, corner, stronger}) == 3


def test_watermark_tiny_image_no_crash(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    media.save_image("tiny.png", _png((40, 30)))
    assert _open(mv.get_variant("tiny.png", "thumb")).size == (40, 30)


def test_watermark_missing_logo_still_no_original(monkeypatch):
    """Нет логотипа → копия без знака (ошибка в лог), но не оригинал в полном размере."""
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    monkeypatch.setattr(mv, "_LOGO_PATH", "/nonexistent/logo.png")
    mv._logo.cache_clear()
    try:
        media.save_image("w.png", _white((2400, 1600)))
        assert _open(mv.get_variant("w.png", "card")).size == (1200, 800)
    finally:
        mv._logo.cache_clear()


def test_watermark_logo_asset_exists():
    assert os.path.isfile(mv._LOGO_PATH)
    assert mv._logo().mode == "RGBA"


def test_admin_media_product_photo_gets_watermarked_card(client, db_session, variants_on, monkeypatch):
    """Обходной путь /admin/media/{имя фото товара} — та же копия со знаком, что на витрине."""
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    media.save_image("p.png", _white((3000, 2000)))
    _product(db_session)
    r = client.get("/api/v1/admin/media/p.png")
    im = Image.open(io.BytesIO(r.content))
    assert im.size == (1200, 800)
    assert _region_changed(im, (800, 650, 1200, 800))


def test_admin_media_banner_not_watermarked(client, variants_on, monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    media.save_image("banner.png", _white((3000, 1000)))
    im = Image.open(io.BytesIO(client.get("/api/v1/admin/media/banner.png").content))
    assert im.size == (1920, 640)
    assert not _region_changed(im, (0, 0, im.width, im.height))

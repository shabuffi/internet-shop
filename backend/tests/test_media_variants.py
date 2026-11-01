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
    assert Image.open(io.BytesIO(r.content)).size == (900, 450)


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
    assert im.size == (900, 600)
    assert _region_changed(im, (600, 480, 900, 600))       # логотип справа снизу
    assert not _region_changed(im, (0, 0, 450, 300))       # слева сверху — чисто


def test_watermark_center(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "center")
    media.save_image("w.png", _white())
    im = _open(mv.get_variant("w.png", "card"))
    assert _region_changed(im, (375, 260, 525, 340))
    assert not _region_changed(im, (0, 0, 110, 110))


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
        assert _open(mv.get_variant("w.png", "card")).size == (900, 600)
    finally:
        mv._logo.cache_clear()


def test_watermark_logo_asset_exists():
    assert os.path.isfile(mv._LOGO_PATH)
    assert mv._logo().mode == "RGBA"


def test_admin_media_product_photo_gets_save_copy(client, db_session, variants_on, monkeypatch):
    """Обходной путь /admin/media/{имя фото товара} — копия «для сохранения» с крупным знаком."""
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SAVE", "center")
    media.save_image("p.png", _white((3000, 2000)))
    _product(db_session)
    r = client.get("/api/v1/admin/media/p.png")
    im = Image.open(io.BytesIO(r.content))
    assert im.size == (1200, 800)
    assert _region_changed(im, (500, 350, 700, 450))       # крупный знак по центру


def test_admin_media_banner_not_watermarked(client, variants_on, monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    media.save_image("banner.png", _white((3000, 1000)))
    im = Image.open(io.BytesIO(client.get("/api/v1/admin/media/banner.png").content))
    assert im.size == (1920, 640)
    assert not _region_changed(im, (0, 0, im.width, im.height))


def _logo_darkness(im, box) -> int:
    """Насколько тёмен самый тёмный пиксель в области (255 — чисто белая)."""
    return 255 - min(im.convert("L").crop(box).getextrema())


def test_save_copy_has_strong_center_mark_card_light_corner(monkeypatch):
    """Видимая копия — лёгкий знак в углу; копия «для сохранения» — крупный и заметнее."""
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_OPACITY", 0.2)
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SAVE", "center")
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SAVE_OPACITY", 0.45)
    media.save_image("w.png", _white())
    card = _open(mv.get_variant("w.png", "card"))
    save = _open(mv.get_variant("w.png", "save"))
    assert card.size == (900, 600) and save.size == (1200, 800)
    # Слои совпадают по геометрии: одинаковые пропорции → object-fit: contain кладёт их
    # в рамку пиксель в пиксель, хоть разрешение и разное.
    assert card.width * save.height == card.height * save.width
    assert not _region_changed(card, (375, 260, 525, 340))  # на видимой — центр чистый
    assert _region_changed(save, (500, 350, 700, 450))      # на сохраняемой — знак по центру
    assert _logo_darkness(save, (0, 0, 1200, 800)) > _logo_darkness(card, (0, 0, 900, 600))


def test_product_image_size_save_allowed(client, db_session, variants_on, monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SAVE", "center")
    media.save_image("p.png", _white((2400, 1600)))
    _product(db_session)
    r = client.get("/api/v1/products/v1/image?size=save")
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    assert Image.open(io.BytesIO(r.content)).size == (1200, 800)



def test_watermark_corners_four_corners_and_center(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SAVE", "corners")
    media.save_image("w.png", _white())
    im = _open(mv.get_variant("w.png", "save"))
    for box in ((20, 20, 340, 110), (860, 20, 1180, 110),       # верхние углы
                (20, 690, 340, 780), (860, 690, 1180, 780),     # нижние углы
                (450, 360, 750, 440)):                          # центр
        assert _region_changed(im, box), box
    assert not _region_changed(im, (450, 0, 750, 120))          # середина верхнего края — чисто
    assert not _region_changed(im, (0, 300, 200, 500))          # середина левого края — чисто


def test_watermark_visible_on_black_photo(monkeypatch):
    """Инцидент «знака не видно»: синий логотип тонул на тёмном фото. Белая обводка → на
    чёрном фоне появляются светлые пиксели."""
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SAVE", "center")
    media.save_image("b.png", _png((1200, 800), (0, 0, 0, 255)))
    im = _open(mv.get_variant("b.png", "save")).convert("L")
    assert im.crop((300, 300, 900, 500)).getextrema()[1] > 90


# ─── фото, загруженные вручную (с телефона владельца) ─────────────────────────

def _phone_jpeg(size=(3000, 2000)) -> bytes:
    """JPEG «с телефона»: поворот 6, камера и GPS-метка в EXIF."""
    img = Image.new("RGB", size, (255, 255, 255))
    exif = Image.Exif()
    exif[0x0112] = 6
    exif[0x010F] = "Apple"
    exif[0x8825] = {1: "N", 2: (55.0, 45.0, 0.0), 3: "E", 4: (37.0, 37.0, 0.0)}   # GPSInfo
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif.tobytes(), quality=80)
    return buf.getvalue()


def test_huge_phone_jpeg_is_resized_not_leaked(monkeypatch):
    """48–50 Мпикс с телефона раньше упирались в лимит памяти и уходили ОРИГИНАЛОМ.
    Лимит здесь занижен, чтобы не гонять 48 Мпикс в тесте — механика та же."""
    monkeypatch.setattr(mv, "_MAX_PIXELS", 2_000_000)
    media.save_image("big.jpg", _phone_jpeg((3000, 2000)))      # 6 Мпикс > лимита, после draft 1.5
    path = mv.get_variant("big.jpg", "card")
    assert path is not None
    im = _open(path)
    assert im.size == (600, 900)                                 # уменьшено и повёрнуто
    assert not im.getexif()                                      # ни камеры, ни GPS


def test_huge_png_over_limit_falls_back(monkeypatch):
    """PNG так не декодировать (нет draft) — за лимитом по-прежнему оригинал (редкость)."""
    monkeypatch.setattr(mv, "_MAX_PIXELS", 1_000_000)
    media.save_image("big.png", _png((2000, 1000)))
    assert mv.get_variant("big.png", "card") is None


def test_admin_uploaded_photo_end_to_end(client, db_session, variants_on, monkeypatch):
    """Фото, загруженное в админке (не из МойСклад): на витрине — уменьшенная копия без
    EXIF/GPS, «для сохранения» — с логотипами, а оригинал на диске нетронут."""
    from app.api.v1.endpoints.admin import _hash_password
    from app.db.models.admin import AdminUser
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SAVE", "corners")
    db_session.add(AdminUser(username="admin", password_hash=_hash_password("password123")))
    db_session.add(Product(id="m1", moysklad_id="ms-m1", name="T", article="A",
                           price=Decimal("10"), stock=1))
    db_session.commit()
    assert client.post("/api/v1/admin/login",
                       json={"username": "admin", "password": "password123"}).status_code == 200

    original = _phone_jpeg((3000, 2000))
    r = client.post("/api/v1/admin/products/m1/images",
                    files={"file": ("IMG_0001.jpg", original, "image/jpeg")})
    assert r.status_code == 200
    name = r.json()["images"][0]
    assert name.startswith("upload_")

    card = Image.open(io.BytesIO(client.get("/api/v1/products/m1/image?size=card").content))
    assert card.size == (600, 900) and not card.getexif()
    assert not _region_changed(card, (0, 0, card.width, card.height))   # на сайте без знака

    save = Image.open(io.BytesIO(client.get("/api/v1/products/m1/image?size=save").content))
    assert save.size == (800, 1200) and not save.getexif()
    assert _region_changed(save, (20, 20, 260, 90))                     # логотип в углу

    with open(media.media_path(name), "rb") as f:                       # оригинал цел
        assert f.read() == original


# ─── картинки категорий и запрет GIF/SVG для фото ────────────────────────────

def _admin_login(client, db_session):
    from app.api.v1.endpoints.admin import _hash_password
    from app.db.models.admin import AdminUser
    db_session.add(AdminUser(username="admin", password_hash=_hash_password("password123")))
    db_session.commit()
    assert client.post("/api/v1/admin/login",
                       json={"username": "admin", "password": "password123"}).status_code == 200


def _category(db, icon, cid="c1"):
    from app.db.models.product import Category
    db.add(Category(id=cid, moysklad_id=f"ms-{cid}", name="Игрушки", icon=icon))
    db.commit()


def test_category_image_card_clean_default_watermarked(client, db_session, variants_on, monkeypatch):
    """Картинка категории — как фото товара: size=card чистая для плитки, а прямой адрес
    без параметра (и size=save) — копия с логотипами."""
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SAVE", "corners")
    media.save_image("upload_cat.png", _white((2400, 1600)))
    _category(db_session, "upload_cat.png")

    card = Image.open(io.BytesIO(client.get("/api/v1/admin/media/upload_cat.png?size=card").content))
    assert card.size == (900, 600)
    assert not _region_changed(card, (0, 0, 900, 600))

    for url in ("/api/v1/admin/media/upload_cat.png", "/api/v1/admin/media/upload_cat.png?size=save"):
        im = Image.open(io.BytesIO(client.get(url).content))
        assert im.size == (1200, 800), url
        assert _region_changed(im, (20, 20, 340, 110)), url      # логотип в углу


def test_banner_ignores_size_param(client, variants_on, monkeypatch):
    """Баннеры/бренды не трогаем: size=card для них не значит ничего, отдаётся media 1920."""
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SAVE", "corners")
    media.save_image("banner.png", _white((3000, 1000)))
    im = Image.open(io.BytesIO(client.get("/api/v1/admin/media/banner.png?size=card").content))
    assert im.size == (1920, 640)
    assert not _region_changed(im, (0, 0, im.width, im.height))


@pytest.mark.parametrize("fname", ["anim.gif", "vector.svg"])
def test_product_photo_upload_rejects_gif_svg(client, db_session, fname):
    _admin_login(client, db_session)
    db_session.add(Product(id="g1", moysklad_id="ms-g1", name="T", price=Decimal("1"), stock=1))
    db_session.commit()
    r = client.post("/api/v1/admin/products/g1/images", files={"file": (fname, b"x", "image/gif")})
    assert r.status_code == 400


def test_category_icon_upload_rejects_svg_accepts_png(client, db_session):
    _admin_login(client, db_session)
    _category(db_session, None)
    r = client.post("/api/v1/admin/categories/c1/icon",
                    files={"file": ("icon.svg", b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml")})
    assert r.status_code == 400
    r = client.post("/api/v1/admin/categories/c1/icon", files={"file": ("icon.png", _png((300, 300)), "image/png")})
    assert r.status_code == 200 and r.json()["name"].endswith(".png")


def test_attach_orphan_rejects_gif(client, db_session):
    _admin_login(client, db_session)
    db_session.add(Product(id="g2", moysklad_id="ms-g2", name="T", price=Decimal("1"), stock=1))
    db_session.commit()
    media.save_image("old.gif", b"GIF89a")
    r = client.post("/api/v1/admin/products/g2/images/attach", json={"filename": "old.gif"})
    assert r.status_code == 400


def test_thumb_save_small_with_logos(client, db_session, variants_on, monkeypatch):
    """Слой поверх превью (каталог, «Новинки», корзина): 500px, с логотипами; видимое
    превью thumb — чистое."""
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SAVE", "corners")
    media.save_image("p.png", _white((2400, 1600)))
    _product(db_session)
    thumb = Image.open(io.BytesIO(client.get("/api/v1/products/v1/image?size=thumb").content))
    ts = Image.open(io.BytesIO(client.get("/api/v1/products/v1/image?size=thumb_save").content))
    assert thumb.size == ts.size == (500, 333)
    assert not _region_changed(thumb, (0, 0, 500, 333))
    assert _region_changed(ts, (5, 5, 140, 50))                # логотип в углу


# ─── шаг 1 деплоя: флаги выключены — витрина как до копий ────────────────────

@pytest.mark.parametrize("size", ["save", "thumb_save"])
def test_save_copies_404_while_variants_off(client, db_session, size):
    """Пока MEDIA_VARIANTS=false, слой «для сохранения» не должен тянуть оригинал второй раз
    (×2 трафик и чистое фото в слое) — 404, слой скрывается сам."""
    media.save_image("p.png", _png())
    _product(db_session)
    assert client.get(f"/api/v1/products/v1/image?size={size}").status_code == 404
    assert client.get("/api/v1/products/v1/image?size=thumb").status_code == 200   # видимое — как было


def test_category_save_layer_404_while_variants_off(client, db_session):
    data = _png((800, 800))
    media.save_image("upload_cat.png", data)
    _category(db_session, "upload_cat.png")
    assert client.get("/api/v1/admin/media/upload_cat.png?size=save").status_code == 404
    r = client.get("/api/v1/admin/media/upload_cat.png?size=card")
    assert r.status_code == 200 and r.content == data                              # видимое — как было


# ─── видимый знак — маленький значок (иконка вкладки) в правом нижнем углу ────

def _blueish(im, box) -> int:
    px = im.convert("RGB").crop(box).getdata()
    return sum(1 for r, g, b in px if b > 120 and r < 80)


def test_visible_icon_small_bottom_right(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_MARK", "icon")
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_OPACITY", 0.85)
    media.save_image("w.png", _white())
    im = _open(mv.get_variant("w.png", "card"))               # 900x600, значок ~108px
    assert im.size == (900, 600)
    assert _blueish(im, (765, 465, 885, 585)) > 2000            # значок справа снизу
    assert not _region_changed(im, (0, 0, 740, 600))             # остальное фото — чистое
    assert not _region_changed(im, (740, 0, 900, 450))


def test_visible_logo_mode_still_available(monkeypatch):
    """MEDIA_WATERMARK_MARK=logo — прежний полный логотип (шире значка)."""
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_MARK", "logo")
    media.save_image("w.png", _white())
    im = _open(mv.get_variant("w.png", "card"))
    assert _region_changed(im, (620, 520, 740, 590))             # логотип заходит левее значка


def test_mark_kind_in_variant_name(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    media.save_image("w.png", _white())
    logo_path = mv.get_variant("w.png", "card")
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_MARK", "icon")
    assert mv.get_variant("w.png", "card") != logo_path


def test_save_copy_keeps_full_logos_with_icon_visible(monkeypatch):
    """Видимый знак — значок, а сохраняемая копия — по-прежнему полные логотипы по углам."""
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SAVE", "corners")
    media.save_image("w.png", _white())
    save = _open(mv.get_variant("w.png", "save"))
    assert _region_changed(save, (20, 20, 340, 110))             # логотип слева сверху


# ─── размещение «на товаре» (object): обрезать знак можно только вместе с товаром ─

def _product_on_white(size=(1200, 800), box=(100, 100, 700, 500), color=(40, 90, 160)) -> bytes:
    img = Image.new("RGB", size, (255, 255, 255))
    Image.Image.paste(img, color, box)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _changed_box(a, b):
    """Где картинки заметно различаются (порог отсекает шум повторного сжатия WebP)."""
    from PIL import ImageChops
    diff = ImageChops.difference(a.convert("RGB"), b.convert("RGB")).convert("L")
    return diff.point(lambda v: 255 if v > 40 else 0).getbbox()


def test_object_mode_puts_logo_on_the_product(monkeypatch):
    media.save_image("p.png", _product_on_white())             # товар слева сверху
    plain = _open(mv.get_variant("p.png", "card"))             # 900x600, товар (75,75)-(525,375)
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "object")
    im = _open(mv.get_variant("p.png", "card"))
    l, t, r, b = _changed_box(plain, im)
    assert l >= 75 and t >= 75 and r <= 526 and b <= 376        # знак целиком внутри товара
    assert r > 400 and b > 300                                   # в его правом нижнем углу
    assert not _region_changed(im, (560, 400, 900, 600))         # угол ФОТО (пустой фон) — чист


def test_object_mode_full_bleed_photo_insets_from_edges(monkeypatch):
    """Фото «в край» (фона нет) — знак с отступом ~10% от краёв, а не прижат к углу."""
    img = Image.new("RGB", (1200, 800))
    for x in range(1200):
        Image.Image.paste(img, (x % 255, 120, 255 - x % 255), (x, 0, x + 1, 800))
    buf = io.BytesIO(); img.save(buf, "PNG")
    media.save_image("f.png", buf.getvalue())
    plain = _open(mv.get_variant("f.png", "card"))
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "object")
    im = _open(mv.get_variant("f.png", "card"))
    l, t, r, b = _changed_box(plain, im)
    assert r <= 900 - 50 and b <= 600 - 50                       # не у самого края (10% от 600 = 60)


# ─── копии «для сохранения» — цветной полный логотип; видимый «снизу по центру» ──

def test_save_copy_colored_logo_on_light_white_on_dark(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SAVE", "corners")
    media.save_image("w.png", _white())
    light = _open(mv.get_variant("w.png", "save"))
    tinted = sum(1 for r, g, b in light.convert("RGB").crop((20, 20, 340, 120)).getdata() if b > r + 50)
    assert tinted > 300                                             # на белом — синий бренд
    media.save_image("b.png", _png((1200, 800), (10, 10, 10, 255)))
    dark = _open(mv.get_variant("b.png", "save")).convert("RGB")
    corner = dark.crop((20, 20, 340, 120))
    assert sum(1 for r, g, b in corner.getdata() if b > r + 50) < 50  # на тёмном — не синий…
    assert max(corner.convert("L").getdata()) > 120                 # …а белый


def test_visible_bottom_center(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "bottom")
    media.save_image("w.png", _white())
    im = _open(mv.get_variant("w.png", "card"))                    # 900x600
    assert _region_changed(im, (380, 520, 520, 590))                # снизу по центру
    assert not _region_changed(im, (0, 0, 900, 450))                # выше — чисто
    assert not _region_changed(im, (700, 450, 900, 600))            # правый нижний угол — чист


def test_visible_size_setting(monkeypatch):
    """Размер видимого знака — настройка; смена размера → новая копия."""
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    media.save_image("w.png", _white())
    small_path = mv.get_variant("w.png", "card")
    small = _open(small_path)
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SIZE", 0.3)
    big_path = mv.get_variant("w.png", "card")
    assert big_path != small_path
    big = _open(big_path)
    # знак шире: при 30% он заходит левее, чем при 18%
    assert not _region_changed(small, (560, 450, 680, 600))
    assert _region_changed(big, (560, 450, 680, 600))


# ─── очистка устаревших копий ────────────────────────────────────────────────

def _originals_snapshot():
    d = settings.MEDIA_DIR
    return {n: open(os.path.join(d, n), "rb").read() for n in os.listdir(d) if os.path.isfile(os.path.join(d, n))}


def test_cleanup_removes_copies_of_old_settings_keeps_current(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    media.save_image("w.png", _white())
    old = mv.get_variant("w.png", "card")
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SIZE", 0.3)      # сменили размер знака
    new = mv.get_variant("w.png", "card")
    stats = mv.cleanup_stale()
    assert not os.path.exists(old) and os.path.exists(new)
    assert stats["removed"] == 1


def test_cleanup_removes_copies_of_deleted_and_replaced_originals():
    media.save_image("gone.png", _white())
    media.save_image("kept.png", _white())
    gone = mv.get_variant("gone.png", "thumb")
    kept_old = mv.get_variant("kept.png", "thumb")
    os.remove(media.media_path("gone.png"))                           # оригинал пропал не через delete_image
    media.save_image("kept.png", _white((1000, 600)))                 # фото заменили под тем же именем
    p = media.media_path("kept.png"); st = os.stat(p); os.utime(p, (st.st_atime, st.st_mtime + 5))
    kept_new = mv.get_variant("kept.png", "thumb")
    mv.cleanup_stale()
    assert not os.path.exists(gone) and not os.path.exists(kept_old)
    assert os.path.exists(kept_new)


def test_cleanup_keeps_banner_media_copies_and_never_touches_originals(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_WATERMARK", "corner")
    media.save_image("banner.png", _white((3000, 1000)))
    media.save_image("p.png", _white())
    media.save_image("icon.svg", b"<svg xmlns='http://www.w3.org/2000/svg'/>")
    media.save_image("images_1.json", b"{}")
    banner = mv.get_variant("banner.png", "media")
    mv.get_variant("p.png", "card")
    before = _originals_snapshot()
    monkeypatch.setattr(settings, "MEDIA_WATERMARK_SIZE", 0.4)       # все видимые копии «устарели»
    mv.cleanup_stale()
    assert os.path.exists(banner)                                      # баннер — актуален
    assert _originals_snapshot() == before                             # оригиналы побайтно те же


def test_cleanup_tmp_files_by_age():
    media.save_image("w.png", _white())
    mv.get_variant("w.png", "thumb")
    vdir = os.path.join(settings.MEDIA_DIR, mv.VARIANT_DIR)
    old_tmp, fresh_tmp = os.path.join(vdir, "a.tmp"), os.path.join(vdir, "b.tmp")
    for f in (old_tmp, fresh_tmp):
        open(f, "wb").write(b"x")
    os.utime(old_tmp, (0, 0))
    mv.cleanup_stale()
    assert not os.path.exists(old_tmp) and os.path.exists(fresh_tmp)


def test_cleanup_without_variant_dir_is_noop():
    assert mv.cleanup_stale() == {"kept": 0, "removed": 0, "freed_mb": 0}

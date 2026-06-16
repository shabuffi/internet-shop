"""Тесты картинок через обмен CommerceML: хранилище, приём файла, отдача из медиа."""

from decimal import Decimal

import app.services.media_storage as media
from app.db.models.product import Product


# ─── медиа-хранилище ─────────────────────────────────────────────────────────

def test_image_name_basename():
    assert media.image_name("import_files/abc.jpg") == "abc.jpg"
    assert media.image_name("a\\b\\c.png") == "c.png"
    assert media.image_name(None) is None


def test_is_image_filename():
    assert media.is_image_filename("x.PNG")
    assert media.is_image_filename("import_files/y.jpeg")
    assert not media.is_image_filename("import.xml")
    assert not media.is_image_filename("offers.xml")


def test_save_and_read_image(tmp_path, monkeypatch):
    monkeypatch.setattr(media.settings, "MEDIA_DIR", str(tmp_path))
    name = media.save_image("import_files/pic.png", b"\x89PNG data")
    assert name == "pic.png"
    result = media.read_image("pic.png")
    assert result is not None
    data, ct = result
    assert data == b"\x89PNG data"
    assert ct == "image/png"


def test_read_image_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(media.settings, "MEDIA_DIR", str(tmp_path))
    assert media.read_image("nope.jpg") is None


def test_save_image_strips_path_traversal(tmp_path, monkeypatch):
    monkeypatch.setattr(media.settings, "MEDIA_DIR", str(tmp_path))
    name = media.save_image("../../etc/passwd.png", b"x")
    assert name == "passwd.png"                 # путь срезан до basename
    assert (tmp_path / "passwd.png").exists()


# ─── приём картинки обменом ──────────────────────────────────────────────────

def test_exchange_accepts_image_file(client, monkeypatch, tmp_path):
    monkeypatch.setattr(media.settings, "MEDIA_DIR", str(tmp_path))
    resp = client.post("/api/v1/1c/exchange?mode=file&filename=prod-img.jpg", content=b"JPEGDATA")
    assert resp.status_code == 200
    assert resp.text == "success"
    assert (tmp_path / "prod-img.jpg").exists()


def test_exchange_reassembles_chunked_import(client, db_session):
    """Большой import.xml приходит несколькими кусками — обмен их склеивает, а не затирает."""
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<КоммерческаяИнформация><Каталог><Товары>'
        '<Товар><Ид>chunk-1</Ид><Наименование>Чанк Тест</Наименование><Артикул>CHK-1</Артикул></Товар>'
        '</Товары></Каталог></КоммерческаяИнформация>'
    ).encode("utf-8")
    half = len(xml) // 2

    client.get("/api/v1/1c/exchange?mode=init")  # старт сеанса — сброс накопленного
    client.post("/api/v1/1c/exchange?mode=file&filename=import.xml", content=xml[:half])
    client.post("/api/v1/1c/exchange?mode=file&filename=import.xml", content=xml[half:])
    r = client.get("/api/v1/1c/exchange?mode=import&filename=import.xml")

    assert "failure" not in r.text.lower()           # не "Start tag expected"
    db_session.expire_all()
    p = db_session.query(Product).filter_by(moysklad_id="chunk-1").first()
    assert p is not None and p.article == "CHK-1"     # склеилось и распарсилось


def test_exchange_rejects_unknown_file(client):
    resp = client.post("/api/v1/1c/exchange?mode=file&filename=evil.exe", content=b"x")
    assert "failure" in resp.text


# ─── отдача картинки из медиа ────────────────────────────────────────────────

def test_image_proxy_serves_from_media(client, db_session, monkeypatch, tmp_path):
    monkeypatch.setattr(media.settings, "MEDIA_DIR", str(tmp_path))
    media.save_image("p.png", b"PNGBYTES")
    db_session.add(Product(id="img1", moysklad_id="ms-img1", name="T", article="A",
                           price=Decimal("10"), stock=1, image_url="p.png"))
    db_session.commit()

    resp = client.get("/api/v1/products/img1/image")
    assert resp.status_code == 200
    assert resp.content == b"PNGBYTES"
    assert resp.headers["content-type"].startswith("image/png")

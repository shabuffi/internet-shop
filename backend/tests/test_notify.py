"""Тесты уведомлений о заказах: формат сообщения + отправка в Telegram/ВК."""

from decimal import Decimal

import app.integrations.notify as notify
from app.db.models.order import Order, OrderItem


def _order():
    return Order(
        number="ORD-0042",
        customer_name="Иван",
        customer_phone="+79001234567",
        customer_email="ivan@mail.ru",
        delivery_address="Москва, ул. Ленина, 1",
        comment="код домофона 1234",
        total_amount=Decimal("600"),
        items=[
            OrderItem(product_name="Крем", product_article="A1", price=Decimal("150"), quantity=2),
            OrderItem(product_name="Шампунь", product_article="B2", price=Decimal("300"), quantity=1),
        ],
    )


def test_build_order_message_contains_key_fields():
    text = notify.build_order_message(_order())
    assert "ORD-0042" in text
    assert "Иван" in text
    assert "+79001234567" in text
    assert "Крем — 2 × 150 ₽" in text
    assert "Шампунь — 1 × 300 ₽" in text
    assert "Итого: 600 ₽" in text
    assert "код домофона 1234" in text


def test_build_order_message_skips_empty_optionals():
    order = _order()
    order.customer_email = None
    order.delivery_address = None
    order.comment = None
    text = notify.build_order_message(order)
    assert "Email" not in text
    assert "Адрес" not in text
    assert "Комментарий" not in text


class _Resp:
    def __init__(self, payload=None):
        self._payload = payload or {}
    def raise_for_status(self):
        pass
    def json(self):
        return self._payload


def test_send_telegram_success(monkeypatch):
    captured = {}
    def fake_post(url, **kw):
        captured["url"] = url
        captured["json"] = kw.get("json")
        return _Resp()
    monkeypatch.setattr(notify.httpx, "post", fake_post)

    assert notify.send_telegram("TOKEN", "CHAT", "привет") is True
    assert "botTOKEN/sendMessage" in captured["url"]
    assert captured["json"]["chat_id"] == "CHAT"
    assert captured["json"]["text"] == "привет"


def test_send_telegram_error_returns_false(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("network down")
    monkeypatch.setattr(notify.httpx, "post", boom)
    assert notify.send_telegram("T", "C", "x") is False  # не пробрасывает исключение


def test_send_vk_success(monkeypatch):
    captured = {}
    def fake_post(url, **kw):
        captured["url"] = url
        captured["data"] = kw.get("data")
        return _Resp({"response": {"message_id": 1}})
    monkeypatch.setattr(notify.httpx, "post", fake_post)

    assert notify.send_vk("TOK", "42", "привет") is True
    assert "messages.send" in captured["url"]
    assert captured["data"]["peer_id"] == "42"
    assert captured["data"]["message"] == "привет"


def test_send_vk_api_error_returns_false(monkeypatch):
    monkeypatch.setattr(notify.httpx, "post", lambda *a, **k: _Resp({"error": {"error_code": 901}}))
    assert notify.send_vk("TOK", "42", "x") is False

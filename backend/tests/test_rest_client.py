"""Тесты сборки заказа для МойСклад (REST): резерв остатка + склад."""

import app.integrations.moysklad.rest_client as rc


class _Resp:
    def raise_for_status(self):
        pass
    def json(self):
        return {"id": "order-id"}


def test_create_customer_order_reserves_quantity(monkeypatch):
    captured = {}
    monkeypatch.setattr(rc, "get_or_create_counterparty", lambda name, phone: "https://x/agent/1")
    monkeypatch.setattr(rc, "get_main_store_href", lambda: "https://x/store/1")

    def fake_post(url, **kw):
        captured["url"] = url
        captured["json"] = kw.get("json")
        return _Resp()
    monkeypatch.setattr(rc.httpx, "post", fake_post)

    result = rc.create_customer_order(
        organization_href="https://x/org/1",
        customer_name="Иван",
        customer_phone="+79001234567",
        positions=[{"href": "https://x/product/1", "quantity": 3, "price": 150.0}],
    )

    assert result["id"] == "order-id"
    pos = captured["json"]["positions"][0]
    assert pos["quantity"] == 3
    assert pos["reserve"] == 3          # резерв = заказанный объём
    assert pos["price"] == 15000        # 150 ₽ → копейки
    assert captured["json"]["store"]["meta"]["href"] == "https://x/store/1"


def test_create_customer_order_without_store(monkeypatch):
    """Если склад не определился — заказ создаётся без store, но с резервом."""
    captured = {}
    monkeypatch.setattr(rc, "get_or_create_counterparty", lambda name, phone: "https://x/agent/1")
    monkeypatch.setattr(rc, "get_main_store_href", lambda: None)

    def fake_post(url, **kw):
        captured["json"] = kw.get("json")
        return _Resp()
    monkeypatch.setattr(rc.httpx, "post", fake_post)

    rc.create_customer_order(
        organization_href="org",
        customer_name="Иван",
        customer_phone="+79001234567",
        positions=[{"href": "p", "quantity": 2, "price": 100.0}],
    )

    assert "store" not in captured["json"]
    assert captured["json"]["positions"][0]["reserve"] == 2

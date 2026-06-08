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


def test_release_order_reserve_zeroes_positions(monkeypatch):
    calls = []

    class GetResp:
        def raise_for_status(self):
            pass
        def json(self):
            return {"rows": [{"id": "pos1"}, {"id": "pos2"}]}

    class PutResp:
        def raise_for_status(self):
            pass

    def fake_get(url, **kw):
        calls.append(("GET", url))
        return GetResp()

    def fake_put(url, **kw):
        calls.append(("PUT", url, kw.get("json")))
        return PutResp()

    monkeypatch.setattr(rc.httpx, "get", fake_get)
    monkeypatch.setattr(rc.httpx, "put", fake_put)

    assert rc.release_order_reserve("order-123") is True
    puts = [c for c in calls if c[0] == "PUT"]
    assert len(puts) == 2                              # по позиции на каждую
    assert all(c[2] == {"reserve": 0} for c in puts)   # резерв обнуляется
    assert "pos1" in puts[0][1] and "pos2" in puts[1][1]


def test_release_order_reserve_handles_error(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("network")
    monkeypatch.setattr(rc.httpx, "get", boom)
    assert rc.release_order_reserve("order-x") is False  # не пробрасывает исключение


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

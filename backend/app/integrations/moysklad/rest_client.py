"""
МойСклад REST API клиент.
Документация: https://dev.moysklad.ru/doc/api/remap/1.2/
"""

import base64
import httpx
from app.core.config import settings

BASE = "https://api.moysklad.ru/api/remap/1.2"


def _get_credentials() -> tuple[str, str]:
    """Возвращает логин/пароль REST API МойСклад.

    Берёт значения из БД (ShopSettings), а если их там нет — из ``.env``. Это позволяет
    настраивать доступ к МойСклад через админку, не трогая конфиг.

    Returns:
        Кортеж ``(login, password)`` — настоящие креды аккаунта МойСклад.
    """
    try:
        from app.db.session import SessionLocal
        from app.db.models.admin import ShopSettings
        db = SessionLocal()
        try:
            login_row = db.get(ShopSettings, "moysklad_login")
            pass_row  = db.get(ShopSettings, "moysklad_password")
            login = login_row.value if login_row and login_row.value else settings.MOYSKLAD_LOGIN
            password = pass_row.value if pass_row and pass_row.value else settings.MOYSKLAD_PASSWORD
            return login, password
        finally:
            db.close()
    except Exception:
        return settings.MOYSKLAD_LOGIN, settings.MOYSKLAD_PASSWORD


def _headers() -> dict:
    """Собирает HTTP-заголовки с Basic Auth для запросов к МойСклад.

    Returns:
        Заголовки с ``Authorization: Basic ...`` и ``Content-Type: application/json``.
    """
    login, password = _get_credentials()
    creds = base64.b64encode(f"{login}:{password}".encode()).decode()
    return {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}


def get_product_image_url(moysklad_id: str) -> str | None:
    """Возвращает URL миниатюры первого изображения товара.

    Args:
        moysklad_id: UUID товара в МойСклад.

    Returns:
        href миниатюры первого изображения или ``None`` (нет картинок либо ошибка запроса).
    """
    try:
        r = httpx.get(
            f"{BASE}/entity/product/{moysklad_id}/images",
            headers=_headers(),
            timeout=10,
        )
        r.raise_for_status()
        rows = r.json().get("rows", [])
        if rows:
            return rows[0].get("miniature", {}).get("href")
        return None
    except Exception:
        return None


def get_organization_href() -> str:
    """Возвращает href первой организации аккаунта МойСклад.

    Returns:
        href организации (нужен для создания заказов).

    Raises:
        RuntimeError: Если в аккаунте нет организаций.
        httpx.HTTPStatusError: При ошибке запроса/авторизации.
    """
    r = httpx.get(f"{BASE}/entity/organization", headers=_headers(), timeout=10)
    r.raise_for_status()
    rows = r.json().get("rows", [])
    if not rows:
        raise RuntimeError("Организации не найдены в МойСклад")
    return rows[0]["meta"]["href"]


def find_product_href_by_article(article: str) -> str | None:
    """Ищет товар в МойСклад по артикулу.

    Args:
        article: Артикул товара.

    Returns:
        href найденного товара или ``None``, если товар не найден.
    """
    r = httpx.get(
        f"{BASE}/entity/product",
        params={"filter": f"article={article}"},
        headers=_headers(),
        timeout=10,
    )
    r.raise_for_status()
    rows = r.json().get("rows", [])
    return rows[0]["meta"]["href"] if rows else None


def get_or_create_counterparty(name: str, phone: str) -> str:
    """Находит контрагента по телефону или создаёт нового.

    Args:
        name: Имя покупателя.
        phone: Телефон покупателя (ключ поиска).

    Returns:
        href найденного или созданного контрагента.
    """
    # Ищем по номеру телефона
    r = httpx.get(
        f"{BASE}/entity/counterparty",
        params={"filter": f"phone={phone}"},
        headers=_headers(),
        timeout=10,
    )
    r.raise_for_status()
    rows = r.json().get("rows", [])
    if rows:
        return rows[0]["meta"]["href"]

    # Не нашли — создаём
    r = httpx.post(
        f"{BASE}/entity/counterparty",
        json={"name": name, "phone": phone},
        headers=_headers(),
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["meta"]["href"]


def create_customer_order(
    organization_href: str,
    customer_name: str,
    customer_phone: str,
    positions: list[dict],
    description: str = "",
) -> dict:
    """Создаёт покупательский заказ в МойСклад.

    Контрагент находится/создаётся по телефону. Цена в позициях указывается в рублях и
    внутри конвертируется в копейки (МойСклад хранит цены в копейках).

    Args:
        organization_href: href организации (из :func:`get_organization_href`).
        customer_name: Имя покупателя.
        customer_phone: Телефон покупателя.
        positions: Список позиций вида
            ``[{"href": "<product href>", "quantity": 2, "price": 1250.0}]`` (цена в рублях).
        description: Комментарий к заказу; если пуст — собирается автоматически.

    Returns:
        JSON созданного заказа от МойСклад (содержит, в т.ч., ``id``).

    Raises:
        httpx.HTTPStatusError: При ошибке создания заказа.
    """
    agent_href = get_or_create_counterparty(customer_name, customer_phone)

    payload = {
        "organization": {"meta": {"href": organization_href, "type": "organization", "mediaType": "application/json"}},
        "agent": {"meta": {"href": agent_href, "type": "counterparty", "mediaType": "application/json"}},
        "description": description or f"Заказ от {customer_name}, тел: {customer_phone}",
        "positions": [
            {
                "quantity": p["quantity"],
                "price": int(float(p["price"]) * 100),  # рубли → копейки
                "assortment": {"meta": {"href": p["href"], "type": "product", "mediaType": "application/json"}},
            }
            for p in positions
        ],
    }

    r = httpx.post(
        f"{BASE}/entity/customerorder",
        json=payload,
        headers=_headers(),
        timeout=15,
    )
    r.raise_for_status()
    return r.json()

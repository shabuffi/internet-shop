"""Уведомления о новых заказах: ВКонтакте.

Креды берутся из ``ShopSettings`` (админка) с фолбэком на ``.env``.

ВКонтакте: бот работает от имени сообщества (`group_token`), писать можно только тем,
кто сам написал сообществу первым (`peer_id` — id владельца).
"""

import random

import httpx

from app.core.config import settings


def get_notify_config() -> dict:
    """Возвращает креды уведомлений: ShopSettings (админка) с фолбэком на ``.env``.

    Returns:
        Словарь с ключами ``vk_token``, ``vk_peer``.
    """
    cfg = {
        "vk_token": settings.VK_GROUP_TOKEN,
        "vk_peer": settings.VK_PEER_ID,
    }
    try:
        from app.db.session import SessionLocal
        from app.db.models.admin import ShopSettings
        db = SessionLocal()
        try:
            mapping = {
                "vk_token": "vk_group_token",
                "vk_peer": "vk_peer_id",
            }
            for cfg_key, setting_key in mapping.items():
                row = db.get(ShopSettings, setting_key)
                if row and row.value:
                    cfg[cfg_key] = row.value
        finally:
            db.close()
    except Exception:
        pass
    return cfg


def build_order_message(order) -> str:
    """Собирает текст уведомления о новом заказе (обычный текст, без разметки).

    Args:
        order: ORM-объект заказа (с подгруженными ``items``).

    Returns:
        Готовый многострочный текст для отправки в Telegram/ВК.
    """
    lines = [f"🛒 Новый заказ {order.number}", ""]
    lines.append(f"Покупатель: {order.customer_name}")
    lines.append(f"Телефон: {order.customer_phone}")
    if order.customer_email:
        lines.append(f"Email: {order.customer_email}")
    if order.delivery_address:
        lines.append(f"Адрес: {order.delivery_address}")
    lines.append("")
    lines.append("Позиции:")
    for it in order.items:
        lines.append(f"• {it.product_name} — {it.quantity} × {it.price:.0f} ₽")
    lines.append("")
    lines.append(f"Итого: {order.total_amount:.0f} ₽")
    if order.comment:
        lines.append(f"Комментарий: {order.comment}")
    return "\n".join(lines)


def build_customer_order_message(order, shop_name: str = "Магазин") -> str:
    """Текст письма-подтверждения ПОКУПАТЕЛЮ (тон — для клиента, а не владельца)."""
    lines = [f"Здравствуйте, {order.customer_name}!", ""]
    lines.append(f"Спасибо за заказ в «{shop_name}». Мы получили ваш заказ {order.number} и скоро свяжемся с вами.")
    lines.append("")
    lines.append("Состав заказа:")
    for it in order.items:
        lines.append(f"• {it.product_name} — {it.quantity} × {it.price:.0f} ₽")
    lines.append("")
    lines.append(f"Итого: {order.total_amount:.0f} ₽")
    if order.delivery_address:
        lines.append(f"Адрес доставки: {order.delivery_address}")
    lines.append("")
    lines.append("Если заказ оформлен по ошибке или нужно что-то изменить — просто ответьте на это письмо.")
    return "\n".join(lines)


def send_vk(token: str, peer_id: str, text: str) -> bool:
    """Отправляет сообщение в ВКонтакте от имени сообщества (``messages.send``).

    Args:
        token: Ключ доступа сообщества.
        peer_id: id получателя (владельца, который написал сообществу первым).
        text: Текст сообщения.

    Returns:
        ``True`` при успешной отправке, иначе ``False``. Ошибки VK API
        (``{"error": ...}``) и сетевые сбои логируются, исключение не пробрасывается.
    """
    try:
        r = httpx.post(
            "https://api.vk.com/method/messages.send",
            data={
                "access_token": token,
                "peer_id": peer_id,
                "message": text,
                "random_id": random.randint(1, 2_000_000_000),
                "v": "5.199",
            },
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        if "error" in data:
            print(f"VK уведомление не отправлено: {data['error']}", flush=True)
            return False
        return True
    except Exception as exc:
        print(f"VK уведомление не отправлено: {exc}", flush=True)
        return False

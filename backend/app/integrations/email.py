"""Письмо-подтверждение покупателю по SMTP.

Креды берутся из ``ShopSettings`` (админка → Настройки) с фолбэком на ``.env`` — как у
уведомлений в Telegram/ВК. Письмо шлётся на ``order.customer_email``, если он указан и
SMTP настроен. Ошибки не пробрасываются (письмо не должно ронять заказ).
"""

import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr

from app.core.config import settings


def get_smtp_config() -> dict:
    """Возвращает SMTP-настройки: ShopSettings (админка) с фолбэком на ``.env``.

    Returns:
        Словарь ``host``, ``port``, ``user``, ``password``, ``from_email``.
    """
    cfg = {
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        "user": settings.SMTP_USER,
        "password": settings.SMTP_PASSWORD,
        "from_email": settings.SMTP_FROM or settings.SMTP_USER,
    }
    try:
        from app.db.session import SessionLocal
        from app.db.models.admin import ShopSettings
        db = SessionLocal()
        try:
            mapping = {
                "host": "smtp_host", "port": "smtp_port", "user": "smtp_user",
                "password": "smtp_password", "from_email": "smtp_from",
            }
            for cfg_key, setting_key in mapping.items():
                row = db.get(ShopSettings, setting_key)
                if row and row.value:
                    cfg[cfg_key] = row.value
            if not cfg["from_email"]:
                cfg["from_email"] = cfg["user"]
        finally:
            db.close()
    except Exception:
        pass
    return cfg


def build_customer_email(order, shop_name: str = "Магазин") -> tuple[str, str]:
    """Собирает тему и текст письма-подтверждения для покупателя.

    Args:
        order: ORM-заказ (с подгруженными ``items``).
        shop_name: Название магазина (для темы и подписи).

    Returns:
        Кортеж ``(subject, body)``.
    """
    lines = [
        f"Здравствуйте, {order.customer_name}!",
        "",
        f"Спасибо за заказ {order.number} в магазине «{shop_name}». Мы его приняли.",
        "",
        "Состав заказа:",
    ]
    for it in order.items:
        lines.append(f"• {it.product_name} — {it.quantity} × {it.price:.0f} ₽")
    lines += [
        "",
        f"Итого: {order.total_amount:.0f} ₽",
        "",
        "Мы свяжемся с вами для подтверждения деталей доставки. Спасибо, что выбрали нас!",
    ]
    return f"Заказ {order.number} принят — {shop_name}", "\n".join(lines)


def send_email(to: str, subject: str, body: str, from_name: str = "Магазин") -> bool:
    """Отправляет письмо по SMTP (STARTTLS).

    Args:
        to: Email получателя.
        subject: Тема.
        body: Текст (plain).
        from_name: Отображаемое имя отправителя.

    Returns:
        ``True`` при успехе, иначе ``False`` (нет настроек/ошибка — логируется, не падает).
    """
    cfg = get_smtp_config()
    if not (cfg["host"] and cfg["user"] and cfg["password"] and to):
        return False
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = formataddr((from_name, cfg["from_email"]))
        msg["To"] = to
        port = int(cfg["port"] or 587)
        with smtplib.SMTP(cfg["host"], port, timeout=15) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["from_email"], [to], msg.as_string())
        return True
    except Exception as exc:
        print(f"Письмо покупателю не отправлено: {exc}", flush=True)
        return False

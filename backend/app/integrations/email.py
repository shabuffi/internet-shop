"""Отправка письма по SMTP (используется как email-канал уведомлений владельцу о заказе).

Креды берутся из ``ShopSettings`` (админка → Настройки) с фолбэком на ``.env`` — как у
уведомлений в Telegram/ВК. Ошибки не пробрасываются (письмо не должно ронять заказ).
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


def send_email_detail(to: str, subject: str, body: str, from_name: str = "Магазин") -> tuple[bool, str | None]:
    """Отправляет письмо по SMTP (STARTTLS) и возвращает причину неудачи.

    Адрес «От кого» используется только если это валидный email (есть ``@``); иначе
    берём логин — большинство почт (Яндекс/Mail/Gmail) разрешают слать лишь со своего адреса.

    Args:
        to: Email получателя.
        subject: Тема.
        body: Текст (plain).
        from_name: Отображаемое имя отправителя.

    Returns:
        Кортеж ``(успех, причина_ошибки|None)``.
    """
    cfg = get_smtp_config()
    if not (cfg["host"] and cfg["user"] and cfg["password"] and to):
        return False, "не заполнены данные SMTP (сервер / логин / пароль)"
    # «От кого» должен быть email и (для Яндекса и пр.) совпадать с логином — иначе берём логин
    from_addr = cfg["from_email"] if "@" in (cfg["from_email"] or "") else cfg["user"]
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = formataddr((from_name, from_addr))
        msg["To"] = to
        port = int(cfg["port"] or 587)
        with smtplib.SMTP(cfg["host"], port, timeout=15) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.sendmail(from_addr, [to], msg.as_string())
        return True, None
    except Exception as exc:
        print(f"Email-уведомление не отправлено: {exc}", flush=True)
        return False, str(exc)[:200]


def send_email(to: str, subject: str, body: str, from_name: str = "Магазин") -> bool:
    """Отправляет письмо по SMTP. ``True`` при успехе (обёртка над :func:`send_email_detail`)."""
    ok, _ = send_email_detail(to, subject, body, from_name)
    return ok

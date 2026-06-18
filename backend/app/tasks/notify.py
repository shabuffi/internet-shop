from app.tasks.celery_app import celery_app


@celery_app.task(name="app.tasks.notify.notify_new_order")
def notify_new_order(order_id: str):
    """Celery-задача: уведомление владельцу о новом заказе — ВК / Email.

    Запускается из ``create_order`` фоном, чтобы покупатель не ждал внешних API.
    Шлёт в каждый настроенный канал; ошибки отправки не пробрасываются (не критично для заказа).

    Args:
        order_id: ID заказа в нашей БД.

    Returns:
        Словарь ``{"sent": [...]}`` — в какие каналы ушло уведомление.
    """
    from app.db.session import SessionLocal
    from app.db.models.order import Order
    from app.db.models.admin import ShopSettings
    from app.integrations.notify import (
        get_notify_config,
        build_order_message,
        send_vk,
    )
    from app.integrations.email import send_email

    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        if not order:
            print(f"notify_new_order: заказ {order_id} не найден", flush=True)
            return {"sent": []}

        sent = []

        text = build_order_message(order)
        cfg = get_notify_config()
        name_row = db.get(ShopSettings, "shop_name")
        shop_name = name_row.value if name_row and name_row.value else "Магазин"

        # ── Владельцу: ВК / Email ──
        configured = []   # какие каналы заданы (по ним пытались отправить)
        if cfg["vk_token"] and cfg["vk_peer"]:
            configured.append("vk")
            if send_vk(cfg["vk_token"], cfg["vk_peer"], text):
                sent.append("vk")
        # email владельца — третий канал уведомлений (как ТГ/ВК); шлём то же сообщение.
        # Если адрес получателя не задан — по умолчанию шлём на сам SMTP-ящик (логин).
        owner_row = db.get(ShopSettings, "notify_email")
        owner_email = owner_row.value if owner_row and owner_row.value else None
        if not owner_email:
            smtp_row = db.get(ShopSettings, "smtp_user")
            owner_email = smtp_row.value if smtp_row and smtp_row.value else None
        if owner_email:
            configured.append("email")
            if send_email(owner_email, f"Новый заказ {order.number} — {shop_name}", text, from_name=shop_name):
                sent.append("email")

        if sent:
            print(f"notify_new_order: {order.number} → отправлено: {', '.join(sent)}", flush=True)
        elif configured:
            # каналы заданы, но ни один не сработал — ищи причину выше (таймаут/ошибка отправки)
            print(f"notify_new_order: {order.number} — НЕ удалось отправить ни в один канал "
                  f"({', '.join(configured)}); смотри ошибки '... не отправлено' выше", flush=True)
        else:
            print(f"notify_new_order: {order.number} — каналы не настроены (заполни в админке)", flush=True)
        return {"sent": sent}
    finally:
        db.close()


@celery_app.task(name="app.tasks.notify.notify_new_lead")
def notify_new_lead(lead_id: str):
    """Celery-задача: уведомление владельцу о новой заявке с сайта — ВК / Email.

    По образцу :func:`notify_new_order`. Ошибки отправки не пробрасываются.

    Args:
        lead_id: ID заявки в нашей БД.

    Returns:
        Словарь ``{"sent": [...]}`` — в какие каналы ушло уведомление.
    """
    from app.db.session import SessionLocal
    from app.db.models.lead import Lead
    from app.db.models.admin import ShopSettings
    from app.integrations.notify import get_notify_config, send_vk
    from app.integrations.email import send_email

    db = SessionLocal()
    try:
        lead = db.get(Lead, lead_id)
        if not lead:
            print(f"notify_new_lead: заявка {lead_id} не найдена", flush=True)
            return {"sent": []}

        name_row = db.get(ShopSettings, "shop_name")
        shop_name = name_row.value if name_row and name_row.value else "Магазин"

        lines = [f"🆕 Заявка на прайс — {shop_name}", "",
                 f"Имя: {lead.name}", f"Телефон: {lead.phone}"]
        if lead.shop_name:
            lines.append(f"Магазин: {lead.shop_name}")
        if lead.region:
            lines.append(f"Регион: {lead.region}")
        if lead.comment:
            lines.append(f"Комментарий: {lead.comment}")
        text = "\n".join(lines)

        cfg = get_notify_config()
        sent = []
        if cfg["vk_token"] and cfg["vk_peer"]:
            if send_vk(cfg["vk_token"], cfg["vk_peer"], text):
                sent.append("vk")
        owner_row = db.get(ShopSettings, "notify_email")
        owner_email = owner_row.value if owner_row and owner_row.value else None
        if not owner_email:
            smtp_row = db.get(ShopSettings, "smtp_user")
            owner_email = smtp_row.value if smtp_row and smtp_row.value else None
        if owner_email:
            if send_email(owner_email, f"Заявка на прайс — {shop_name}", text, from_name=shop_name):
                sent.append("email")

        print(f"notify_new_lead: {lead.id} → {sent or 'каналы не настроены'}", flush=True)
        return {"sent": sent}
    finally:
        db.close()

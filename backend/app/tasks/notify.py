from app.tasks.celery_app import celery_app


@celery_app.task(name="app.tasks.notify.notify_new_order")
def notify_new_order(order_id: str):
    """Celery-задача: уведомления о новом заказе — владельцу (Telegram/ВК) и покупателю (email).

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
        send_telegram,
        send_vk,
    )
    from app.integrations.email import build_customer_email, send_email

    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        if not order:
            print(f"notify_new_order: заказ {order_id} не найден", flush=True)
            return {"sent": []}

        sent = []

        # ── Владельцу: Telegram / ВК ──
        text = build_order_message(order)
        cfg = get_notify_config()
        if cfg["tg_token"] and cfg["tg_chat"]:
            if send_telegram(cfg["tg_token"], cfg["tg_chat"], text):
                sent.append("telegram")
        if cfg["vk_token"] and cfg["vk_peer"]:
            if send_vk(cfg["vk_token"], cfg["vk_peer"], text):
                sent.append("vk")

        # ── Покупателю: письмо-подтверждение (если есть email и настроен SMTP) ──
        if order.customer_email:
            name_row = db.get(ShopSettings, "shop_name")
            shop_name = name_row.value if name_row and name_row.value else "Магазин"
            subject, body = build_customer_email(order, shop_name)
            if send_email(order.customer_email, subject, body, from_name=shop_name):
                sent.append("email")

        if sent:
            print(f"notify_new_order: {order.number} → {', '.join(sent)}", flush=True)
        else:
            print(f"notify_new_order: каналы не настроены, заказ {order.number}", flush=True)
        return {"sent": sent}
    finally:
        db.close()

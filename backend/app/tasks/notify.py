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


@celery_app.task(name="app.tasks.notify.notify_new_registration")
def notify_new_registration(user_id: str):
    """Celery-задача: уведомление владельцу о новой регистрации покупателя — ВК / Email.

    По образцу :func:`notify_new_lead`. Ошибки отправки не пробрасываются.

    Args:
        user_id: ID покупателя в нашей БД.

    Returns:
        Словарь ``{"sent": [...]}`` — в какие каналы ушло уведомление.
    """
    from app.db.session import SessionLocal
    from app.db.models.user import User
    from app.db.models.admin import ShopSettings
    from app.integrations.notify import get_notify_config, send_vk
    from app.integrations.email import send_email

    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user:
            print(f"notify_new_registration: покупатель {user_id} не найден", flush=True)
            return {"sent": []}

        name_row = db.get(ShopSettings, "shop_name")
        shop_name = name_row.value if name_row and name_row.value else "Магазин"

        types = {"individual": "Физлицо", "ip": "ИП", "ooo": "ООО"}
        lines = [f"🆕 Новая регистрация — {shop_name}", "",
                 f"Наименование: {user.customer_name}",
                 f"Тип: {types.get(user.customer_type, user.customer_type)}",
                 f"Телефон: {user.phone}",
                 f"Email: {user.email}"]
        if user.inn:
            lines.append(f"ИНН: {user.inn}")
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
            if send_email(owner_email, f"Новая регистрация — {shop_name}", text, from_name=shop_name):
                sent.append("email")

        print(f"notify_new_registration: {user.id} → {sent or 'каналы не настроены'}", flush=True)
        return {"sent": sent}
    finally:
        db.close()


@celery_app.task(name="app.tasks.notify.check_exchange_health")
def check_exchange_health():
    """Beat-задача: следит, что МойСклад выходит на обмен. Алерт владельцу при простое.

    «Последний контакт» пишется в Redis при каждом заходе МойСклад (``exchange.py``).
    Если контакта не было дольше ``EXCHANGE_STALE_HOURS`` — шлём предупреждение владельцу
    (ВК/email), но не чаще раза в тот же период (флаг-кулдаун в Redis). Как только обмен
    возобновится — флаг сбрасывается, и следующий простой снова даст алерт.

    Returns:
        Словарь со статусом проверки (``ok`` / ``stale`` / ``no_data``).
    """
    from datetime import datetime, timezone
    from app.core.config import settings
    from app.core.redis_client import redis_client
    from app.db.session import SessionLocal
    from app.db.models.admin import ShopSettings
    from app.integrations.notify import get_notify_config, send_vk
    from app.integrations.email import send_email

    LAST_SEEN_KEY = "exchange:last_seen"
    ALERTED_KEY = "exchange:stale_alerted"
    threshold_h = settings.EXCHANGE_STALE_HOURS

    raw = redis_client.get(LAST_SEEN_KEY)
    if not raw:
        # Обмена ещё не было ни разу (свежая установка) — не шумим.
        return {"status": "no_data"}

    try:
        last = datetime.fromisoformat(raw.decode() if isinstance(raw, bytes) else raw)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
    except Exception:
        return {"status": "no_data"}

    age_h = (datetime.now(timezone.utc) - last).total_seconds() / 3600

    # Обмен свежий → снимаем флаг, чтобы следующий простой снова дал алерт.
    if age_h < threshold_h:
        redis_client.delete(ALERTED_KEY)
        return {"status": "ok", "age_hours": round(age_h, 1)}

    # Простой. Алертим не чаще раза в период (кулдаун = порог).
    if redis_client.get(ALERTED_KEY):
        return {"status": "stale", "age_hours": round(age_h, 1), "alerted": False}

    db = SessionLocal()
    try:
        name_row = db.get(ShopSettings, "shop_name")
        shop_name = name_row.value if name_row and name_row.value else "Магазин"
        text = (f"⚠️ МойСклад: обмена не было ~{int(age_h)} ч "
                f"(последний контакт {last.astimezone().strftime('%d.%m %H:%M')}).\n"
                f"Проверьте выгрузку в МойСклад (Онлайн-торговля) и адрес магазина.")

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
            if send_email(owner_email, f"МойСклад: обмен остановился — {shop_name}", text, from_name=shop_name):
                sent.append("email")

        # Ставим кулдаун (в секундах), чтобы не спамить каждый час.
        redis_client.set(ALERTED_KEY, "1", ex=threshold_h * 3600)
        print(f"check_exchange_health: простой {int(age_h)}ч → алерт {sent or 'каналы не настроены'}", flush=True)
        return {"status": "stale", "age_hours": round(age_h, 1), "alerted": True, "sent": sent}
    finally:
        db.close()


def _shop_name(db) -> str:
    from app.db.models.admin import ShopSettings
    row = db.get(ShopSettings, "shop_name")
    return row.value if row and row.value else "Магазин"


@celery_app.task(name="app.tasks.notify.notify_order_confirmation")
def notify_order_confirmation(order_id: str):
    """Письмо ПОКУПАТЕЛЮ с подтверждением заказа (номер, состав, сумма, контакты магазина).

    Шлётся фоном из ``create_order``. Если у заказа нет email — тихо выходим. Ошибки отправки
    не пробрасываются (письмо не должно ронять заказ).
    """
    from app.db.session import SessionLocal
    from app.db.models.order import Order
    import app.db.models.user  # noqa: F401 — регистрируем маппер User (у Order есть связь с ним)
    from app.db.models.admin import ShopSettings
    from app.integrations.email import send_email

    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        if not order or not order.customer_email:
            return {"sent": False}
        shop_name = _shop_name(db)
        phone_row = db.get(ShopSettings, "contact_phone")
        shop_phone = phone_row.value if phone_row and phone_row.value else ""

        lines = [
            f"Здравствуйте, {order.customer_name}!", "",
            f"Спасибо за заказ в «{shop_name}». Мы получили вашу заявку № {order.number}.", "",
            "Состав заказа:",
        ]
        for it in order.items:
            lines.append(f"• {it.product_name} — {it.quantity} × {it.price:.2f} ₽ = {it.price * it.quantity:.2f} ₽")
        lines += ["", f"Итого: {order.total_amount:.2f} ₽", ""]
        if order.delivery_address:
            lines.append(f"Адрес доставки: {order.delivery_address}")
        if order.comment:
            lines.append(f"Комментарий: {order.comment}")
        lines += ["", "Мы свяжемся с вами для подтверждения заказа."]
        if shop_phone:
            lines.append(f"Наш телефон: {shop_phone}")
        text = "\n".join(lines)

        ok = send_email(order.customer_email, f"Заказ № {order.number} принят — {shop_name}", text, from_name=shop_name)
        print(f"notify_order_confirmation: {order.number} → покупателю {'отправлено' if ok else 'НЕ отправлено'}", flush=True)
        return {"sent": bool(ok)}
    finally:
        db.close()


@celery_app.task(name="app.tasks.notify.notify_order_status")
def notify_order_status(order_id: str, status: str):
    """Письмо ПОКУПАТЕЛЮ при изменении статуса заказа в МойСклад.

    Ставится из обмена (``_apply_order_statuses``), когда у заказа сменился ``moysklad_status``.
    Нет email у заказа — тихо выходим. Ошибки отправки не пробрасываем.
    """
    from app.db.session import SessionLocal
    from app.db.models.order import Order
    import app.db.models.user  # noqa: F401 — регистрируем маппер User (у Order есть связь)
    from app.integrations.email import send_email

    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        if not order or not order.customer_email:
            return {"sent": False}
        shop_name = _shop_name(db)
        lines = [
            f"Здравствуйте, {order.customer_name}!", "",
            # Пишем строго факт — НОВЫЙ СТАТУС (письмо шлётся только при реальной смене статуса).
            # Слова «обновлён/актуальный» НЕ используем: заказ мог не меняться, только статус —
            # чтобы не вводить покупателя в заблуждение, будто состав/сумму изменили.
            f"Заказ № {order.number} в «{shop_name}» — новый статус:", "",
            f"    {status}", "",
            # Состав показываем нейтрально, для справки (в МойСклад его могли и поменять вместе
            # со статусом — тогда здесь уже обновлённые позиции; если нет — просто текущий состав).
            "Состав заказа:",
        ]
        for it in order.items:
            lines.append(f"• {it.product_name} — {it.quantity} × {it.price:.2f} ₽ = {it.price * it.quantity:.2f} ₽")
        lines += ["", f"Итого: {order.total_amount:.2f} ₽", "", "Спасибо, что выбрали нас!"]
        text = "\n".join(lines)
        ok = send_email(order.customer_email, f"Заказ № {order.number}: {status} — {shop_name}", text, from_name=shop_name)
        print(f"notify_order_status: {order.number} → «{status}» → покупателю {'отправлено' if ok else 'НЕ отправлено'}", flush=True)
        return {"sent": bool(ok)}
    finally:
        db.close()


@celery_app.task(name="app.tasks.notify.send_password_reset")
def send_password_reset(user_id: str, token: str):
    """Письмо ПОКУПАТЕЛЮ со ссылкой восстановления пароля (действует 1 час).

    Ссылка ведёт на страницу ``/reset?token=...`` фронта (база — первый ALLOWED_ORIGINS).
    """
    from app.db.session import SessionLocal
    from app.db.models.user import User
    from app.integrations.email import send_email
    from app.core.config import settings

    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if not user or not user.email:
            return {"sent": False}
        base = (settings.ALLOWED_ORIGINS[0] if settings.ALLOWED_ORIGINS else "https://td-engineer.ru").rstrip("/")
        link = f"{base}/reset?token={token}"
        shop_name = _shop_name(db)
        text = (
            f"Здравствуйте!\n\n"
            f"Вы запросили восстановление пароля на сайте «{shop_name}».\n"
            f"Чтобы задать новый пароль, перейдите по ссылке (действует 1 час):\n\n"
            f"{link}\n\n"
            f"Если вы не запрашивали восстановление — просто проигнорируйте это письмо, "
            f"пароль останется прежним."
        )
        ok = send_email(user.email, f"Восстановление пароля — {shop_name}", text, from_name=shop_name)
        print(f"send_password_reset: {user.email} → {'отправлено' if ok else 'НЕ отправлено'}", flush=True)
        return {"sent": bool(ok)}
    finally:
        db.close()

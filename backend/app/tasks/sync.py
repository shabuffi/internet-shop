from app.tasks.celery_app import celery_app


@celery_app.task(name="app.tasks.sync.sync_catalog")
def sync_catalog():
    """Периодическая синхронизация каталога из МойСклад. Реализация — в Sprint 5."""
    print("TODO: sync catalog from МойСклад via REST API", flush=True)
    return {"status": "ok"}


@celery_app.task(name="app.tasks.sync.push_order_to_moysklad", bind=True, max_retries=3)
def push_order_to_moysklad(self, order_id: str):
    """
    Отправляет заказ в МойСклад.
    bind=True даёт доступ к self для retry.
    max_retries=3 — повторит 3 раза если МойСклад недоступен.
    """
    from app.db.session import SessionLocal
    from app.db.models.order import Order  # noqa
    from app.db.models.product import Product  # noqa — нужен чтобы SQLAlchemy видел таблицу products
    from app.integrations.moysklad.rest_client import (
        get_organization_href,
        find_product_href_by_article,
        create_customer_order,
    )

    db = SessionLocal()
    try:
        order = db.get(Order, order_id)
        if not order:
            print(f"Order {order_id} not found", flush=True)
            return

        if order.moysklad_id:
            print(f"Order {order.number} already synced: {order.moysklad_id}", flush=True)
            return

        org_href = get_organization_href()

        # Собираем позиции — ищем каждый товар в МойСклад по артикулу
        positions = []
        for item in order.items:
            if not item.product_article:
                continue
            href = find_product_href_by_article(item.product_article)
            if href:
                positions.append({
                    "href": href,
                    "quantity": item.quantity,
                    "price": float(item.price),
                })
            else:
                print(f"Product not found in МойСклад: {item.product_article}", flush=True)

        if not positions:
            print(f"No positions to sync for order {order.number}", flush=True)
            return

        result = create_customer_order(
            organization_href=org_href,
            customer_name=order.customer_name,
            customer_phone=order.customer_phone,
            positions=positions,
            description=f"Заказ {order.number} с сайта. Тел: {order.customer_phone}",
        )

        order.moysklad_id = result["id"]
        db.commit()
        print(f"Order {order.number} synced → МойСклад id: {result['id']}", flush=True)

    except Exception as exc:
        db.rollback()
        print(f"Error syncing order {order_id}: {exc}", flush=True)
        # Повторить через 60 секунд (countdown), если остались попытки
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()

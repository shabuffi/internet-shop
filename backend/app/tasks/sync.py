from app.tasks.celery_app import celery_app


@celery_app.task(name="app.tasks.sync.fetch_product_images")
def fetch_product_images():
    """Celery-задача: дозагружает из REST МойСклад картинку И описание товаров.

    CommerceML не приносит описание/картинки надёжно, поэтому берём их из REST API,
    находя товар по артикулу (id из CommerceML не совпадает с id REST). Обрабатывает
    партию из максимум 50 активных товаров с артикулом, у которых ещё нет картинки или
    описания. Запускается из админки кнопкой «Загрузить картинки».

    Returns:
        Словарь ``{"updated": N}`` — сколько товаров получили картинку и/или описание.
    """
    from sqlalchemy import select, or_
    from app.db.session import SessionLocal
    from app.db.models.product import Product
    from app.integrations.moysklad.rest_client import get_product_enrichment_by_article

    db = SessionLocal()
    try:
        products = db.scalars(
            select(Product)
            .where(
                Product.is_active == True,
                Product.article.isnot(None),
                or_(Product.image_url.is_(None), Product.description.is_(None)),
            )
            .limit(50)
        ).all()

        updated = 0
        for product in products:
            description, image_url = get_product_enrichment_by_article(product.article)
            changed = False
            if image_url and not product.image_url:
                product.image_url = image_url
                changed = True
            if description and not product.description:
                product.description = description
                changed = True
            if changed:
                updated += 1

        if updated:
            db.commit()
        print(f"fetch_product_images: обновлено {updated} товаров", flush=True)
        return {"updated": updated}
    finally:
        db.close()


@celery_app.task(name="app.tasks.sync.push_order_to_moysklad", bind=True, max_retries=3)
def push_order_to_moysklad(self, order_id: str):
    """Celery-задача: отправляет заказ в МойСклад (REST API).

    Идемпотентна: если у заказа уже есть ``moysklad_id`` — выходит без действий. Товары
    в МойСклад ищутся по артикулу. При недоступности МойСклад повторяет до 3 раз с
    паузой 60 секунд (``bind=True`` нужен для доступа к ``self.retry``).

    Args:
        order_id: ID заказа в нашей БД.

    Raises:
        Retry: Перезапуск задачи при ошибке (пока не исчерпаны попытки).
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

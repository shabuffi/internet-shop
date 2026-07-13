"""
CommerceML exchange endpoint для приёма данных от МойСклад.

МойСклад обращается к этому URL в определённом порядке:
  GET  /api/v1/1c/exchange?mode=checkauth   → "success\nsession\ntoken"
  GET  /api/v1/1c/exchange?mode=init        → "zip=no\nfile_limit=..."
  POST /api/v1/1c/exchange?mode=file&type=catalog&filename=import.xml  → тело = XML
  GET  /api/v1/1c/exchange?mode=import&filename=import.xml  → запускает импорт

Состояние обмена (токен сессии + сырые XML) хранится в Redis с TTL, а не в памяти
процесса. Это переживает перезапуск backend и работает при нескольких воркерах.
"""

import base64
import logging
import secrets
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import bcrypt
from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.redis_client import redis_client
from app.db.session import get_db
from app.db.models.admin import ShopSettings
from app.db.models.order import Order, OrderItem
from app.db.models.product import Product
from app.integrations.moysklad.commerceml_parser import parse_import_xml, parse_offers_xml
from app.integrations.moysklad.commerceml_orders import build_orders_xml
from app.services.import_service import upsert_catalog
from app.services.media_storage import is_image_filename, save_image

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/1c/exchange", tags=["1C Exchange"])

# Ключи и TTL состояния обмена в Redis
_SESSION_KEY = "exchange:session_token"
_FILE_KEY = "exchange:file:{name}"          # сырой XML текущей сессии
_TTL = 3600                                  # 1 час — сессия обмена не длится дольше

# Метка последнего контакта МойСклад — для мониторинга простоя обмена (без TTL, переживает паузы)
_LAST_SEEN_KEY = "exchange:last_seen"
# Метка последней успешной синхронизации ЗАКАЗОВ (приём orders.xml) — показываем в админке
_LAST_ORDERS_SYNC_KEY = "exchange:last_orders_sync"


def _touch_exchange_seen() -> None:
    """Отмечает момент последнего обращения МойСклад к обмену (для алерта о простое)."""
    try:
        redis_client.set(_LAST_SEEN_KEY, datetime.now(timezone.utc).isoformat())
    except Exception:
        pass


def _touch_orders_sync() -> None:
    """Отмечает момент последней синхронизации заказов (получили orders.xml от МойСклад)."""
    try:
        redis_client.set(_LAST_ORDERS_SYNC_KEY, datetime.now(timezone.utc).isoformat())
    except Exception:
        pass


def _file_key(name: str) -> str:
    """Формирует Redis-ключ для сырого XML-файла обмена.

    Args:
        name: Имя файла обмена (``import.xml`` или ``offers.xml``).

    Returns:
        Ключ вида ``exchange:file:import.xml``.
    """
    return _FILE_KEY.format(name=name)


# Ключ Redis: id заказов, отданных в последнем mode=query (помечаем их на mode=success)
_PENDING_ORDERS_KEY = "exchange:sale:pending_orders"


def _orders_query_response(db: Session) -> Response:
    """Отдаёт МойСклад невыгруженные заказы в виде CommerceML-XML (шаг ``mode=query``).

    Берёт заказы с ``exported_at IS NULL`` (и не отменённые), сопоставляет позиции с
    каталогом по ``moysklad_id`` и запоминает их id в Redis — чтобы пометить
    выгруженными на шаге ``mode=success``.

    Args:
        db: Сессия БД.

    Returns:
        :class:`Response` с XML заказов (``application/xml``).
    """
    orders = db.scalars(
        select(Order)
        .where(Order.exported_at.is_(None), Order.status != "cancelled")
        .order_by(Order.created_at)
    ).all()

    # Сопоставляем позиции с каталогом МойСклад по moysklad_id товара
    product_ids = {item.product_id for o in orders for item in o.items}
    ms_id_by_product = {}
    if product_ids:
        for p in db.scalars(select(Product).where(Product.id.in_(product_ids))):
            ms_id_by_product[p.id] = p.moysklad_id

    # «Внешний код» единого контрагента для гостевых заказов (без регистрации), если задан
    # владельцем в настройках — чтобы гости не плодили новых контрагентов в МойСклад.
    from app.db.models.admin import ShopSettings
    guest_row = db.get(ShopSettings, "guest_moysklad_ext_code")
    guest_ext_code = guest_row.value.strip() if guest_row and guest_row.value else None

    xml = build_orders_xml(orders, ms_id_by_product, guest_ext_code=guest_ext_code)

    # Запоминаем, какие заказы отдали — чтобы пометить выгруженными на mode=success
    if orders:
        redis_client.set(_PENDING_ORDERS_KEY, ",".join(o.id for o in orders), ex=_TTL)
    logger.info("EXCHANGE query: отдано заказов %d", len(orders))
    return Response(content=xml, media_type="application/xml")


def _mark_orders_exported(db: Session) -> None:
    """Помечает выгруженными заказы, отданные в последнем ``mode=query`` (шаг ``success``).

    Args:
        db: Сессия БД.
    """
    pending = redis_client.get(_PENDING_ORDERS_KEY)
    if not pending:
        return
    ids = pending.decode("utf-8").split(",")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    marked = 0
    for oid in ids:
        order = db.get(Order, oid)
        if order and order.exported_at is None:
            order.exported_at = now
            marked += 1
    db.commit()
    redis_client.delete(_PENDING_ORDERS_KEY)
    logger.info("EXCHANGE success: помечено выгруженными %d", marked)


_CENTS = Decimal("0.01")


def _to_decimal(s) -> Decimal | None:
    """Строка МойСклад → Decimal с округлением до копеек (или None при мусоре)."""
    if s is None:
        return None
    try:
        return Decimal(str(s)).quantize(_CENTS)
    except (InvalidOperation, ValueError, TypeError):
        return None


def _to_qty(s) -> int | None:
    """Количество из МойСклад («5.0») → целое (магазин штучный)."""
    try:
        return max(0, int(round(float(s))))
    except (TypeError, ValueError):
        return None


def _desired_items(rows: list[dict]) -> list[dict]:
    """Позиции из парсера → нормализованные ``{ms_id, article, name, price, quantity}``.

    Отбрасываем позиции без имени/цены/количества (кол-во 0 тоже отбрасываем).
    """
    out: list[dict] = []
    for it in rows:
        price = _to_decimal(it.get("price"))
        qty = _to_qty(it.get("quantity"))
        name = (it.get("name") or "").strip()
        if not name or price is None or not qty:
            continue
        out.append({
            "ms_id": (it.get("ms_id") or "").strip(),
            "article": (it.get("article") or "").strip() or None,
            "name": name,
            "price": price,
            "quantity": qty,
        })
    return out


def _sig(pairs) -> list:
    """Сигнатура состава (имя, цена, кол-во) без учёта порядка — для сравнения."""
    return sorted((p["name"], str(p["price"]), p["quantity"]) for p in pairs)


def _apply_order_statuses(db: Session, body: bytes) -> int:
    """Применяет данные из orders.xml к нашим заказам (сопоставление по номеру).

    МойСклад присылает по каждому заказу статус, номер по 1С, состав (Товары) и итог (Сумма).
    Обновляем:
      • ``moysklad_status`` / ``moysklad_number`` — статус и внутренний номер;
      • ``ПометкаУдаления=true`` → отменяем заказ на сайте (остаток не трогаем — им управляет МойСклад);
      • **состав** (позиции) и **сумму** — если в МойСклад заказ отредактировали.

    Состав перезаписываем снимком из МойСклад: ``product_id`` ищем по ``moysklad_id`` товара
    (если товара уже нет в каталоге — ссылка пустая, имя/цена сохраняются). Остаток товаров
    на сайте НЕ трогаем.

    Returns:
        Число заказов, у которых что-то изменилось.
    """
    from app.integrations.moysklad.commerceml_order_status import parse_order_statuses
    n = 0
    # (order_id, новый статус | None) — письма покупателю после коммита.
    # status=None → изменился только состав/сумма (без смены статуса).
    customer_mails: list[tuple[str, str | None]] = []
    for r in parse_order_statuses(body):
        order = db.scalar(select(Order).where(Order.number == r["number"]))
        if not order:
            continue
        changed = False
        status_changed = False
        content_changed = False
        if r["status"] and order.moysklad_status != r["status"]:
            order.moysklad_status = r["status"]
            changed = True
            status_changed = True
        if r["ms_number"] and order.moysklad_number != r["ms_number"]:
            order.moysklad_number = r["ms_number"]
            changed = True
        # Отмена: либо документ помечен на удаление (ПометкаУдаления), либо статус заказа
        # в МойСклад стал «Отменён/Отменен». В обоих случаях помечаем заказ отменённым
        # (показывается красным, у покупателя в кабинете — «Отменён»).
        is_cancelled = r["deleted"] or ("отмен" in (r["status"] or "").lower())
        if is_cancelled and order.status != "cancelled":
            order.status = "cancelled"
            changed = True

        # Состав заказа: пришёл (есть секция Товары) и отличается от текущего — перезаписываем.
        raw_items = r.get("items")
        desired = _desired_items(raw_items) if raw_items else []
        if desired and _sig(desired) != _sig(
            [{"name": i.product_name, "price": i.price, "quantity": i.quantity} for i in order.items]
        ):
            order.items.clear()
            for d in desired:
                pid = (
                    db.scalar(select(Product.id).where(Product.moysklad_id == d["ms_id"]))
                    if d["ms_id"] else None
                )
                order.items.append(OrderItem(
                    product_id=pid,
                    product_name=d["name"],
                    product_article=d["article"],
                    price=d["price"],
                    quantity=d["quantity"],
                ))
            changed = True
            content_changed = True

        # Сумма заказа: итог документа; если его нет — считаем по позициям.
        total = _to_decimal(r.get("total"))
        if total is None and desired:
            total = sum((d["price"] * d["quantity"] for d in desired), Decimal("0")).quantize(_CENTS)
        if total is not None and order.total_amount != total:
            order.total_amount = total
            changed = True
            content_changed = True

        # Письмо покупателю (одинаково для заказов из кабинета и гостевых — адресат в
        # order.customer_email). При смене статуса шлём статус-письмо (в нём уже виден
        # обновлённый состав). Если статус НЕ менялся, но изменился состав/сумма — шлём
        # письмо об изменении заказа (иначе гость без кабинета не узнал бы о правках).
        if status_changed:
            customer_mails.append((order.id, r["status"]))
        elif content_changed:
            customer_mails.append((order.id, None))

        if changed:
            n += 1
    db.commit()

    # После успешного commit — письма покупателям (фоном, как остальные уведомления заказа).
    if customer_mails:
        from app.tasks.notify import notify_order_status
        for oid, st in customer_mails:
            try:
                notify_order_status.delay(oid, st)
            except Exception:
                pass
    return n


# ── Аутентификация обмена ─────────────────────────────────────────────────────
# МойСклад присылает логин/пароль (Basic Auth) на checkauth и cookie на
# последующих запросах. Сверяем их с парой, сохранённой в админке.
# «Мягкий режим»: пока пара не задана в админке — пускаем всех (старое поведение),
# чтобы не сломать уже настроенный обмен. Как только клиент задал пару — проверка
# включается автоматически.

def _get_exchange_credentials(db: Session) -> tuple[str, str]:
    """Достаёт логин и хеш пароля обмена из настроек магазина (ShopSettings).

    Args:
        db: Сессия БД.

    Returns:
        Кортеж ``(login, password_hash)``. Если креды не заданы — обе строки пустые,
        что включает «мягкий режим» в :func:`_is_authorized`.
    """
    login_row = db.get(ShopSettings, "exchange_login")
    pass_row = db.get(ShopSettings, "exchange_password")
    login = login_row.value if login_row and login_row.value else ""
    password = pass_row.value if pass_row and pass_row.value else ""
    return login, password


def _basic_auth_ok(request: Request, exp_login: str, exp_pass_hash: str) -> bool:
    """Проверяет HTTP Basic Auth из запроса против сохранённых кред обмена.

    Логин сравнивается constant-time-методом, пароль — через bcrypt против хеша.

    Args:
        request: Входящий запрос (берётся заголовок ``Authorization``).
        exp_login: Ожидаемый логин обмена.
        exp_pass_hash: bcrypt-хеш ожидаемого пароля обмена из ShopSettings.

    Returns:
        ``True``, если присланные логин и пароль совпали с ожидаемыми. ``False`` при
        пустых ожидаемых кредах, отсутствии/порче заголовка или несовпадении.
    """
    if not exp_login or not exp_pass_hash:
        return False  # пустые ожидаемые креды никогда не считаем валидными
    header = request.headers.get("Authorization", "")
    if not header.startswith("Basic "):
        return False
    try:
        login, _, password = base64.b64decode(header[6:]).decode("utf-8").partition(":")
    except Exception:
        return False
    if not secrets.compare_digest(login, exp_login):
        return False
    try:
        return bcrypt.checkpw(password.encode(), exp_pass_hash.encode())
    except Exception:
        return False  # некорректный хеш в БД


def _is_authorized(request: Request, db: Session) -> bool:
    """Решает, пускать ли запрос обмена (для всех шагов, кроме checkauth).

    Пропускает, если выполнено любое из условий:

    * креды обмена не заданы в админке — «мягкий режим», чтобы не сломать уже
      настроенный обмен;
    * пришёл валидный Basic Auth;
    * пришла cookie ``session`` с токеном, выданным на checkauth (хранится в Redis).

    Args:
        request: Входящий запрос обмена (заголовки и cookies).
        db: Сессия БД.

    Returns:
        ``True``, если запрос авторизован, иначе ``False``.
    """
    exp_login, exp_pass = _get_exchange_credentials(db)
    if not exp_login or not exp_pass:
        return True  # мягкий режим: креды не заданы — пускаем (как раньше)
    if _basic_auth_ok(request, exp_login, exp_pass):
        return True
    cookie = request.cookies.get("session")
    if not cookie:
        return False
    stored = redis_client.get(_SESSION_KEY)
    return bool(stored and secrets.compare_digest(cookie, stored.decode("utf-8")))


@router.get("", response_class=PlainTextResponse)
@router.get("/", response_class=PlainTextResponse)
async def exchange_get(
    request: Request,
    mode: str = Query(...),
    type: str = Query(default=""),
    filename: str = Query(default=""),
    db: Session = Depends(get_db),
):
    """Обрабатывает GET-шаги протокола обмена 1С/CommerceML.

    Маршрутизирует по параметру ``mode``:

    * ``checkauth`` — проверяет логин/пароль обмена и выдаёт токен сессии (3 строки 1С);
    * ``init`` — отдаёт параметры обмена (zip, лимит размера файла);
    * ``import`` — собирает import.xml/offers.xml из Redis, парсит и пишет в БД.

    Args:
        request: Входящий запрос (заголовки, cookies).
        mode: Шаг протокола (``checkauth`` / ``init`` / ``import``).
        type: Тип данных от МойСклад (не используется, оставлен для совместимости).
        filename: Имя файла для шага ``import`` (``import.xml`` / ``offers.xml``).
        db: Сессия БД.

    Returns:
        Plain-text ответ протокола 1С: строка ``success...`` либо ``failure\\n<причина>``.
    """
    # Временное логирование протокола (Этап 0 миграции на CommerceML): видеть, какие
    # mode/type шлёт МойСклад — особенно запрос заказов (type=sale&mode=query).
    logger.info("EXCHANGE GET mode=%s type=%s filename=%s", mode, type, filename)
    _touch_exchange_seen()   # МойСклад на связи (checkauth идёт в начале каждой сессии)

    # ── Шаг 1: checkauth ──────────────────────────────────────────────────────
    # Стандарт 1С требует ровно три строки: "success", имя куки, значение куки
    if mode == "checkauth":
        exp_login, exp_pass = _get_exchange_credentials(db)
        if exp_login and exp_pass:
            if not _basic_auth_ok(request, exp_login, exp_pass):
                logger.warning("checkauth: неверный логин/пароль обмена")
                return "failure\nНеверный логин или пароль обмена"
            token = secrets.token_hex(16)
            redis_client.set(_SESSION_KEY, token, ex=_TTL)
            return f"success\nsession\n{token}"
        # Мягкий режим: пара не задана в админке — старое поведение
        return "success\nsession\ncommerceml-session"

    # Все остальные шаги требуют валидной авторизации
    if not _is_authorized(request, db):
        logger.warning("exchange %s: отказано в доступе", mode)
        return "failure\nНе авторизовано"

    # ── Шаг 2: init ───────────────────────────────────────────────────────────
    # МойСклад спрашивает параметры: поддерживаем ли zip, максимальный размер файла.
    # init = старт нового сеанса обмена → сбрасываем накопленные ранее куски файлов
    # (большой каталог приходит несколькими POST'ами с тем же именем — мы их склеиваем).
    if mode == "init":
        redis_client.delete(_file_key("import.xml"), _file_key("offers.xml"))
        return "zip=no\nfile_limit=10485760"  # 10 MB на один кусок; большие файлы шлются частями

    # ── Выдача заказов: МойСклад сам забирает заказы из магазина ──────────────
    # query → отдаём невыгруженные заказы XML; success → помечаем их выгруженными.
    if mode == "query":
        return _orders_query_response(db)
    if mode == "success":
        _mark_orders_exported(db)
        return "success"

    # ── Шаг 4: import — собираем XML из Redis, парсим и запускаем upsert ──────
    if mode == "import":
        if filename != "import.xml":
            # offers.xml импортируется вместе с import.xml — просто подтверждаем
            return "success"

        import_xml = redis_client.get(_file_key("import.xml"))
        if not import_xml:
            return "failure\nНет данных для импорта"

        # Диагностическая копия полного (склеенного) каталога — сутки; заход с картинками — неделю
        redis_client.set("exchange:diag:import.xml", import_xml, ex=86400)
        if "Картинка".encode() in import_xml:
            redis_client.set("exchange:diag:import_with_kartinka.xml", import_xml, ex=7 * 86400)

        try:
            catalog = parse_import_xml(import_xml)
        except Exception as exc:
            logger.error("PARSE ERROR import.xml: %s", exc)
            return f"failure\nОшибка разбора каталога: {exc}"

        if not catalog.products:
            return "failure\nНет данных для импорта"

        # Цены и остатки лежат в offers.xml — применяем, если он пришёл
        offers_xml = redis_client.get(_file_key("offers.xml"))
        if offers_xml:
            try:
                parse_offers_xml(offers_xml, catalog)
            except Exception as exc:
                logger.error("PARSE ERROR offers.xml: %s", exc)

        log = upsert_catalog(db, catalog, source="commerceml")
        redis_client.delete(_file_key("import.xml"), _file_key("offers.xml"))
        logger.info("Imported: %d created, %d updated", log.products_created, log.products_updated)
        return f"success\nИмпортировано: {log.products_created} новых, {log.products_updated} обновлено"

    return "failure\nНеизвестный mode"


@router.post("", response_class=PlainTextResponse)
@router.post("/", response_class=PlainTextResponse)
async def exchange_post(
    request: Request,
    mode: str = Query(...),
    type: str = Query(default=""),
    filename: str = Query(default=""),
    db: Session = Depends(get_db),
):
    """Обрабатывает POST-шаг ``file`` обмена — приём сырого XML.

    Тело запроса (import.xml или offers.xml) складывается в Redis с TTL; парсинг и
    запись в БД происходят позже, на GET-шаге ``import``.

    Args:
        request: Входящий запрос; тело — байты XML-файла.
        mode: Шаг протокола; ожидается ``file``.
        type: Тип данных (не используется).
        filename: Имя файла; принимаются только ``import.xml`` и ``offers.xml``.
        db: Сессия БД (нужна для проверки авторизации).

    Returns:
        ``success`` при успехе, иначе ``failure\\n<причина>``.
    """
    logger.info("EXCHANGE POST mode=%s type=%s filename=%s", mode, type, filename)

    if not _is_authorized(request, db):
        logger.warning("exchange POST %s: отказано в доступе", mode)
        return "failure\nНе авторизовано"

    # ── Шаг 3: file — МойСклад отправляет файл ────────────────────────────────
    if mode == "file":
        body = await request.body()
        # XML каталога/предложений — складываем сырьё в Redis (парсится на шаге import)
        if filename in ("import.xml", "offers.xml"):
            # Большой каталог МойСклад шлёт НЕСКОЛЬКИМИ кусками с тем же именем —
            # склеиваем (append), а не перезаписываем, иначе остаётся только последний обрезок
            # (он начинается не с '<' → "Start tag expected"). Диагностику снимаем на шаге import.
            key = _file_key(filename)
            redis_client.append(key, body)
            redis_client.expire(key, _TTL)
            logger.info("Received file chunk: %s (+%d bytes)", filename, len(body))
            return "success"
        # Картинка товара (опция «Выгружать изображения») — сохраняем в медиа-хранилище
        if is_image_filename(filename):
            saved = save_image(filename, body)
            logger.info("Received image: %s → %s (%d bytes)", filename, saved, len(body))
            return "success"
        # Изменения по заказам от МойСклад (опция «Выгружать изменения по заказам»):
        # МойСклад загружает orders.xml с текущим состоянием заказов. Разбираем статус
        # («Статус заказа») и обновляем свои заказы по номеру. Сырьё храним для диагностики.
        if filename == "orders.xml":
            redis_client.set("exchange:incoming:orders.xml", body, ex=7 * 86400)
            try:
                updated = _apply_order_statuses(db, body)
                _touch_orders_sync()   # отметка «заказы синхронизированы» — для админки
                logger.info("orders.xml от МойСклад (%d bytes): обновлено заказов %d", len(body), updated)
            except Exception as exc:
                logger.error("orders.xml разбор/применение — ошибка: %s", exc)
            return "success"
        logger.warning("Отклонён файл обмена с именем %s", filename)
        return "failure\nНедопустимое имя файла"

    return "failure\nНеизвестный mode"

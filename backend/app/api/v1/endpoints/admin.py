"""Admin panel API."""

import bcrypt
import hmac
import jwt
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.config import settings
from app.db.session import get_db
from app.db.models.admin import AdminUser, ShopSettings
from app.db.models.product import Product, SyncLog
from app.db.models.order import Order
from app.services import media_storage

router = APIRouter(prefix="/admin", tags=["Admin"])

# JWT админа хранится в httpOnly-куке (а не в localStorage) — недоступен JS, защита от XSS.
COOKIE_NAME = "admin_token"
COOKIE_MAX_AGE = 24 * 3600  # сутки, как и срок жизни JWT

# ─── Auth helpers ──────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    """Возвращает bcrypt-хеш пароля (со случайной солью)."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def _verify_password(password: str, hashed: str) -> bool:
    """Проверяет пароль против bcrypt-хеша. Возвращает ``True`` при совпадении."""
    return bcrypt.checkpw(password.encode(), hashed.encode())

def _create_token(username: str) -> str:
    """Создаёт подписанный JWT для админа со сроком жизни 24 часа.

    Args:
        username: Логин админа (кладётся в claim ``sub``).

    Returns:
        Подписанный HS256-токен.
    """
    payload = {
        "sub": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

def _extract_token(request: Request) -> str | None:
    """Достаёт JWT админа из запроса.

    Сначала смотрит httpOnly-куку, затем — заголовок ``Authorization: Bearer``
    (запасной путь для API-клиентов и тестов).

    Args:
        request: Входящий запрос.

    Returns:
        Строку токена или ``None``, если его нет.
    """
    token = request.cookies.get(COOKIE_NAME)
    if token:
        return token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


def _get_current_admin(request: Request, db: Session = Depends(get_db)) -> AdminUser:
    """FastAPI-зависимость: возвращает текущего админа по токену из запроса.

    Используется как ``Depends(_get_current_admin)`` для защиты эндпоинтов админки.

    Args:
        request: Входящий запрос (кука или заголовок с токеном).
        db: Сессия БД.

    Returns:
        Запись :class:`AdminUser` авторизованного администратора.

    Raises:
        HTTPException: 401, если токен отсутствует, невалиден или пользователь не найден.
    """
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Не авторизовано")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        username = payload.get("sub")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Неверный токен")

    user = db.scalar(select(AdminUser).where(AdminUser.username == username))
    if not user:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    return user


# ─── Auth endpoints ────────────────────────────────────────────────

@router.post("/login")
def login(body: dict, response: Response, db: Session = Depends(get_db)):
    """Аутентифицирует админа и ставит JWT в httpOnly-куку.

    Args:
        body: Тело запроса с полями ``username`` и ``password``.
        response: Объект ответа — на него вешается кука ``admin_token``.
        db: Сессия БД.

    Returns:
        Словарь с токеном (он же в куке) и его типом.

    Raises:
        HTTPException: 401, если логин/пароль не совпали.
    """
    username = body.get("username", "")
    password = body.get("password", "")

    user = db.scalar(select(AdminUser).where(AdminUser.username == username))
    if not user or not _verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    token = _create_token(username)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,           # недоступно JS — защита от XSS
        samesite="lax",
        secure=False,            # ⚠️ включить True, когда сайт переедет на HTTPS
        max_age=COOKIE_MAX_AGE,
        path="/",
    )
    return {"access_token": token, "token_type": "bearer"}


@router.post("/logout")
def logout(response: Response):
    """Сбрасывает httpOnly-куку — выход из админки."""
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"message": "Вышли"}


@router.get("/me")
def me(current: AdminUser = Depends(_get_current_admin)):
    """Проверка авторизации для фронта (валидна ли кука). 401 если нет."""
    return {"username": current.username}


@router.post("/change-password")
def change_password(
    body: dict,
    current: AdminUser = Depends(_get_current_admin),
    db: Session = Depends(get_db),
):
    """Меняет пароль текущего админа.

    Требует знания текущего пароля. Новый пароль хешируется bcrypt.

    Args:
        body: ``{"current_password": ..., "new_password": ...}``.
        current: Авторизованный админ (из токена).
        db: Сессия БД.

    Returns:
        Сообщение об успехе.

    Raises:
        HTTPException: 401, если текущий пароль неверный; 422, если новый короче 8 символов.
    """
    current_password = body.get("current_password", "")
    new_password = body.get("new_password", "")

    if not _verify_password(current_password, current.password_hash):
        raise HTTPException(status_code=401, detail="Текущий пароль неверный")
    if len(new_password) < 8:
        raise HTTPException(status_code=422, detail="Новый пароль минимум 8 символов")

    current.password_hash = _hash_password(new_password)
    db.commit()
    return {"message": "Пароль изменён"}


@router.post("/setup", include_in_schema=False)
def setup_admin(body: dict, db: Session = Depends(get_db)):
    """Создаёт первого admin-пользователя. Отключить после первого использования."""
    if db.scalar(select(AdminUser)):
        raise HTTPException(status_code=400, detail="Администратор уже существует")

    username = body.get("username", "admin")
    password = body.get("password", "")
    if len(password) < 8:
        raise HTTPException(status_code=422, detail="Пароль минимум 8 символов")

    user = AdminUser(username=username, password_hash=_hash_password(password))
    db.add(user)
    db.commit()
    return {"message": f"Администратор {username} создан"}


# ─── Страница «Разработчик» (отдельный пароль) ─────────────────────

DEV_COOKIE_NAME = "dev_token"


def _create_dev_token() -> str:
    """JWT для dev-страницы (claim ``scope=dev``), срок жизни 24 часа."""
    payload = {"scope": "dev", "exp": datetime.now(timezone.utc) + timedelta(hours=24)}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def _get_current_dev(request: Request) -> bool:
    """Зависимость: пускает только при валидном dev-токене (страница «Разработчик»)."""
    token = request.cookies.get(DEV_COOKIE_NAME)
    if not token:
        auth = request.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Не авторизовано (разработчик)")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Неверный токен")
    if payload.get("scope") != "dev":
        raise HTTPException(status_code=401, detail="Неверный токен")
    return True


@router.get("/dev/status")
def dev_status():
    """Доступна ли страница «Разработчик» (задан ли DEV_PASSWORD на сервере)."""
    return {"enabled": bool(settings.DEV_PASSWORD)}


@router.post("/dev/login")
def dev_login(body: dict, response: Response):
    """Вход на страницу «Разработчик» по отдельному паролю (``DEV_PASSWORD`` из .env.prod)."""
    if not settings.DEV_PASSWORD:
        raise HTTPException(status_code=403, detail="Страница разработчика отключена (нет DEV_PASSWORD)")
    if not hmac.compare_digest(str(body.get("password", "")), settings.DEV_PASSWORD):
        raise HTTPException(status_code=401, detail="Неверный пароль")
    response.set_cookie(DEV_COOKIE_NAME, _create_dev_token(), httponly=True,
                        samesite="lax", secure=False, max_age=COOKIE_MAX_AGE, path="/")
    return {"ok": True}


@router.post("/dev/logout")
def dev_logout(response: Response):
    """Выход со страницы «Разработчик»."""
    response.delete_cookie(DEV_COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/dev/settings")
def get_dev_settings(db: Session = Depends(get_db), _=Depends(_get_current_dev)):
    """Технические настройки (обмен / ВК / SMTP) для страницы разработчика. Секреты маскируем."""
    return {
        "exchange_login":     _get_setting(db, "exchange_login"),
        "exchange_password":  "***" if _get_setting(db, "exchange_password") else "",
        "vk_group_token":     "***" if _get_setting(db, "vk_group_token") else "",
        "vk_peer_id":         _get_setting(db, "vk_peer_id"),
        "vk_env":             bool(settings.VK_GROUP_TOKEN and settings.VK_PEER_ID),
        "notify_email":       _get_setting(db, "notify_email"),
        "smtp_host":          _get_setting(db, "smtp_host"),
        "smtp_port":          _get_setting(db, "smtp_port", "587"),
        "smtp_user":          _get_setting(db, "smtp_user"),
        "smtp_password":      "***" if _get_setting(db, "smtp_password") else "",
        "smtp_from":          _get_setting(db, "smtp_from"),
    }


@router.post("/dev/settings")
def save_dev_settings(body: dict, db: Session = Depends(get_db), _=Depends(_get_current_dev)):
    """Сохраняет технические настройки. Поля ``***`` пропускаются; пароль обмена хешируется."""
    allowed = {
        "exchange_login", "exchange_password",
        "vk_group_token", "vk_peer_id", "notify_email",
        "smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_from",
    }
    for key, value in body.items():
        if key not in allowed or value == "***":
            continue
        if key == "exchange_password":
            _set_setting(db, key, _hash_password(str(value)))
        else:
            _set_setting(db, key, str(value))
    db.commit()
    return {"message": "Настройки сохранены"}


# ─── Settings (для владельца) ──────────────────────────────────────

def _get_setting(db: Session, key: str, default: str = "") -> str:
    """Читает значение настройки магазина по ключу.

    Args:
        db: Сессия БД.
        key: Ключ настройки в таблице ShopSettings.
        default: Значение по умолчанию, если ключа нет.

    Returns:
        Сохранённое значение или ``default``.
    """
    row = db.get(ShopSettings, key)
    return row.value if row else default

def _set_setting(db: Session, key: str, value: str):
    """Создаёт или обновляет настройку магазина (без commit).

    Args:
        db: Сессия БД.
        key: Ключ настройки.
        value: Новое значение.
    """
    row = db.get(ShopSettings, key)
    if row:
        row.value = value
    else:
        db.add(ShopSettings(key=key, value=value))


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Настройки для владельца: название, контакты + статусы каналов уведомлений.

    Технические настройки (обмен / ВК-ключ / SMTP) живут на странице «Разработчик».

    Args:
        db: Сессия БД.

    Returns:
        Название, контакты футера и флаги ``vk_configured`` / ``email_configured``.
    """
    from app.integrations.notify import get_notify_config
    from app.integrations.email import get_smtp_config
    vk = get_notify_config()
    smtp = get_smtp_config()
    return {
        "shop_name":          _get_setting(db, "shop_name", "Магазин"),
        # Контакты в футере сайта (видны покупателям)
        "contact_phone":      _get_setting(db, "contact_phone"),
        "contact_email":      _get_setting(db, "contact_email"),
        "contact_hours":      _get_setting(db, "contact_hours"),
        # Статусы каналов — настраиваются на странице «Разработчик», тут только «подключено?»
        "vk_configured":      bool(vk["vk_token"] and vk["vk_peer"]),
        "email_configured":   bool(smtp["host"] and smtp["user"] and smtp["password"]),
    }


@router.post("/settings")
def save_settings(body: dict, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Сохраняет настройки владельца (название + контакты футера).

    Технические поля сюда не входят — они на странице «Разработчик». Неизвестные ключи
    игнорируются.

    Args:
        body: Словарь ``{ключ: значение}`` из формы настроек.
        db: Сессия БД.

    Returns:
        Сообщение об успешном сохранении.
    """
    allowed = {
        "shop_name",
        "contact_phone", "contact_email", "contact_hours",
    }
    for key, value in body.items():
        if key not in allowed or value == "***":
            continue
        _set_setting(db, key, str(value))
    db.commit()
    return {"message": "Настройки сохранены"}


@router.post("/test-notification")
def test_notification(channel: str | None = None, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Шлёт пробное уведомление в канал(ы) — Telegram / ВК / Email.

    Использует СОХРАНЁННЫЕ настройки (из БД). Помогает проверить, что бот/почта
    подключены верно.

    Args:
        channel: Конкретный канал (``telegram`` / ``vk`` / ``email``) или ``None`` — во все.
        db: Сессия БД.

    Returns:
        ``{"results": {канал: "sent"|"failed"}}`` — пусто, если запрошенный канал не настроен.
    """
    from app.integrations.notify import get_notify_config, send_vk
    from app.integrations.email import send_email_detail

    def want(ch: str) -> bool:
        return channel is None or channel == ch

    shop_name = _get_setting(db, "shop_name", "Магазин")
    text = (f"Проверка уведомлений — {shop_name}.\n\n"
            f"Если вы видите это сообщение, канал подключён правильно — "
            f"сюда будут приходить уведомления о новых заказах.")
    cfg = get_notify_config()
    results: dict[str, str] = {}
    details: dict[str, str] = {}   # причина неудачи (для UI)

    if want("vk") and cfg["vk_token"] and cfg["vk_peer"]:
        results["vk"] = "sent" if send_vk(cfg["vk_token"], cfg["vk_peer"], text) else "failed"
    # Получатель писем: «Email владельца», а если он пуст — сам SMTP-ящик (логин)
    owner_email = _get_setting(db, "notify_email") or _get_setting(db, "smtp_user")
    if want("email") and owner_email:
        ok, detail = send_email_detail(owner_email, f"Проверка уведомлений — {shop_name}", text, from_name=shop_name)
        results["email"] = "sent" if ok else "failed"
        if not ok and detail:
            details["email"] = detail

    return {"results": results, "details": details}


# ─── Dashboard data ────────────────────────────────────────────────

@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Сводка для главной страницы админки.

    Args:
        db: Сессия БД.

    Returns:
        Счётчики товаров и заказов плюс краткие данные последней синхронизации.
    """
    product_count = db.scalar(select(__import__("sqlalchemy", fromlist=["func"]).func.count()).select_from(Product))
    order_count   = db.scalar(select(__import__("sqlalchemy", fromlist=["func"]).func.count()).select_from(Order))

    last_sync = db.scalar(
        select(SyncLog).order_by(SyncLog.id.desc())
    )

    return {
        "product_count": product_count,
        "order_count":   order_count,
        "last_sync": {
            "status":            last_sync.status if last_sync else None,
            "products_created":  last_sync.products_created if last_sync else 0,
            "products_updated":  last_sync.products_updated if last_sync else 0,
            "finished_at":       last_sync.finished_at.isoformat() if last_sync and last_sync.finished_at else None,
        } if last_sync else None,
    }


@router.get("/orders")
def list_orders(
    page: int = 1,
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
    """Список заказов для админки с пагинацией (по 20 на страницу).

    Args:
        page: Номер страницы (с 1).
        db: Сессия БД.

    Returns:
        Словарь с заказами текущей страницы (включая число позиций), общим числом и
        номером страницы.
    """
    from sqlalchemy.orm import joinedload
    PAGE = 20
    # .unique() обязателен: joinedload коллекции (Order.items) даёт дублирующиеся строки,
    # и без unique() SQLAlchemy 2.0 кидает InvalidRequestError (иначе /orders падал 500,
    # а фронт молча показывал «0 всего»).
    orders = db.scalars(
        select(Order).options(joinedload(Order.items))
        .order_by(Order.created_at.desc())
        .offset((page - 1) * PAGE).limit(PAGE)
    ).unique().all()
    total = db.scalar(select(__import__("sqlalchemy", fromlist=["func"]).func.count()).select_from(Order))

    return {
        "items": [
            {
                "id": o.id, "number": o.number, "status": o.status,
                "customer_name": o.customer_name, "customer_phone": o.customer_phone,
                "total_amount": str(o.total_amount),
                "exported_at": o.exported_at.isoformat() if o.exported_at else None,
                "created_at": o.created_at.isoformat(),
                "items_count": len(o.items),
            }
            for o in orders
        ],
        "total": total,
        "page": page,
    }


# Допустимые статусы заказа: new → confirmed → shipped → delivered / cancelled
class OrderStatusUpdate(BaseModel):
    # Заказы ведутся в МойСклад; на сайте оставляем только «Новый» и «Отменён»
    # («Отменён» возвращает остаток на сайт). Промежуточные статусы убраны.
    status: Literal["new", "cancelled"]


@router.patch("/orders/{order_id}/status")
def update_order_status(
    order_id: str,
    body: OrderStatusUpdate,
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
    """Меняет статус заказа (``new`` / ``cancelled``).

    Допустимые статусы валидирует Pydantic (``OrderStatusUpdate``). Остаток не трогаем —
    количество товаров на сайте не зависит от заказов.

    Args:
        order_id: ID заказа.
        body: Новый статус.
        db: Сессия БД.

    Returns:
        Словарь с ID заказа и новым статусом.

    Raises:
        HTTPException: 404, если заказ не найден.
    """
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    order.status = body.status
    db.commit()
    return {"id": order.id, "status": order.status}


@router.get("/products")
def list_products_admin(
    page: int = 1,
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
    """Список товаров для админки с пагинацией (по 50 на страницу).

    Args:
        page: Номер страницы (с 1).
        db: Сессия БД.

    Returns:
        Словарь с товарами текущей страницы, общим числом и номером страницы.
    """
    PAGE = 50
    products = db.scalars(
        select(Product).order_by(Product.name)
        .offset((page - 1) * PAGE).limit(PAGE)
    ).all()
    total = db.scalar(select(__import__("sqlalchemy", fromlist=["func"]).func.count()).select_from(Product))

    return {
        "items": [
            {
                "id": p.id, "name": p.name, "article": p.article,
                "price": str(p.price), "stock": p.stock,
                "available": p.available,
                "images": p.images or ([p.image_url] if p.image_url else []),
                "images_manual": p.images_manual,
                "is_active": p.is_active, "synced_at": p.synced_at.isoformat() if p.synced_at else None,
            }
            for p in products
        ],
        "total": total,
        "page": page,
    }


class AvailabilityUpdate(BaseModel):
    available: bool


@router.patch("/products/{product_id}/availability")
def set_product_availability(
    product_id: str,
    body: AvailabilityUpdate,
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
    """Ставит товару флаг наличия (вручную, не зависит от остатка).

    Args:
        product_id: ID товара.
        body: ``{"available": true|false}``.
        db: Сессия БД.

    Returns:
        ``{"id", "available"}``.

    Raises:
        HTTPException: 404, если товар не найден.
    """
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    product.available = body.available
    db.commit()
    return {"id": product.id, "available": product.available}


def _current_images(product: Product) -> list[str]:
    """Текущий список картинок товара (с фолбэком к одиночному image_url)."""
    return list(product.images or ([product.image_url] if product.image_url else []))


@router.post("/products/{product_id}/images")
async def upload_product_image(
    product_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
    """Загружает картинку товара прямо в админке (без МойСклад).

    Файл кладётся в медиа-хранилище, добавляется в ``Product.images`` (первая становится
    ``image_url``). Ставит флаг ``images_manual`` — обмен МойСклад больше не перезаписывает
    картинки этого товара.

    Args:
        product_id: ID товара.
        file: Загружаемый файл картинки.
        db: Сессия БД.

    Returns:
        ``{"images": [...]}`` — обновлённый список.

    Raises:
        HTTPException: 404 — товар не найден; 400 — недопустимый файл.
    """
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    data = await file.read()
    try:
        name = media_storage.save_upload(file.filename or "image.jpg", data)
    except ValueError:
        raise HTTPException(status_code=400, detail="Можно загружать только изображения")

    images = _current_images(product)
    images.append(name)
    product.images = images
    product.image_url = images[0]
    product.images_manual = True
    db.commit()
    return {"images": product.images}


@router.delete("/products/{product_id}/images")
def delete_product_image(
    product_id: str,
    filename: str = Query(...),
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
    """Удаляет картинку товара по имени файла.

    Args:
        product_id: ID товара.
        filename: Имя файла картинки (из ``Product.images``).
        db: Сессия БД.

    Returns:
        ``{"images": [...]}`` — обновлённый список.

    Raises:
        HTTPException: 404, если товар не найден.
    """
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    images = [i for i in _current_images(product) if i != filename]
    product.images = images
    product.image_url = images[0] if images else None
    product.images_manual = True
    db.commit()
    # Физически удаляем только наши загрузки (файлы обмена могут переиспользоваться)
    if filename.startswith("upload_"):
        media_storage.delete_image(filename)
    return {"images": product.images}


@router.get("/store-info")
def store_info_public(db: Session = Depends(get_db)):
    """Публичный эндпойнт — название магазина для фронтенда."""
    return {
        "shop_name":     _get_setting(db, "shop_name", "Магазин"),
        "contact_phone": _get_setting(db, "contact_phone"),
        "contact_email": _get_setting(db, "contact_email"),
        "contact_hours": _get_setting(db, "contact_hours"),
    }


@router.get("/sync-logs")
def sync_logs(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Возвращает последние 20 записей журнала синхронизаций.

    Args:
        db: Сессия БД.

    Returns:
        Список записей синхронизации (источник, статус, счётчики, ошибка, времена).
    """
    logs = db.scalars(select(SyncLog).order_by(SyncLog.id.desc()).limit(20)).all()
    return [
        {
            "id": l.id, "source": l.source, "status": l.status,
            "products_created": l.products_created, "products_updated": l.products_updated,
            "error_message": l.error_message,
            "started_at": l.started_at.isoformat(),
            "finished_at": l.finished_at.isoformat() if l.finished_at else None,
        }
        for l in logs
    ]

"""Admin panel API."""

import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.config import settings
from app.db.session import get_db
from app.db.models.admin import AdminUser, ShopSettings
from app.db.models.product import Product, SyncLog
from app.db.models.order import Order

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


# ─── Settings ──────────────────────────────────────────────────────

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
    """Отдаёт настройки магазина для админки (пароли замаскированы как ``***``).

    Args:
        db: Сессия БД.

    Returns:
        Словарь настроек: логины МойСклад и обмена, маски паролей, название магазина.
    """
    return {
        "moysklad_login":     _get_setting(db, "moysklad_login"),
        "moysklad_password":  "***" if _get_setting(db, "moysklad_password") else "",
        "exchange_login":     _get_setting(db, "exchange_login"),
        "exchange_password":  "***" if _get_setting(db, "exchange_password") else "",
        "shop_name":          _get_setting(db, "shop_name", "Магазин"),
    }


@router.post("/settings")
def save_settings(body: dict, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Сохраняет настройки магазина.

    Поля со значением ``***`` пропускаются (оставить как было). ``exchange_password``
    сохраняется как bcrypt-хеш; ``moysklad_password`` — открытым текстом (он исходящий,
    нужен для запросов к МойСклад). Неизвестные ключи игнорируются.

    Args:
        body: Словарь ``{ключ: значение}`` из формы настроек.
        db: Сессия БД.

    Returns:
        Сообщение об успешном сохранении.
    """
    allowed = {
        "moysklad_login", "moysklad_password",
        "exchange_login", "exchange_password",
        "shop_name",
    }
    for key, value in body.items():
        if key not in allowed or value == "***":
            continue
        # exchange_password — входящий секрет обмена: храним bcrypt-хеш, не открытый текст.
        # (moysklad_password НЕ хешируем — он исходящий, нужен открытым для запросов к МойСклад.)
        if key == "exchange_password":
            _set_setting(db, key, _hash_password(str(value)))
        else:
            _set_setting(db, key, str(value))
    db.commit()
    return {"message": "Настройки сохранены"}


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
    orders = db.scalars(
        select(Order).options(joinedload(Order.items))
        .order_by(Order.created_at.desc())
        .offset((page - 1) * PAGE).limit(PAGE)
    ).all()
    total = db.scalar(select(__import__("sqlalchemy", fromlist=["func"]).func.count()).select_from(Order))

    return {
        "items": [
            {
                "id": o.id, "number": o.number, "status": o.status,
                "customer_name": o.customer_name, "customer_phone": o.customer_phone,
                "total_amount": str(o.total_amount),
                "moysklad_id": o.moysklad_id,
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
    status: Literal["new", "confirmed", "shipped", "delivered", "cancelled"]


@router.patch("/orders/{order_id}/status")
def update_order_status(
    order_id: str,
    body: OrderStatusUpdate,
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
    """Меняет статус заказа.

    Допустимые статусы валидирует Pydantic (``OrderStatusUpdate``) — недопустимое
    значение даёт 422 ещё до тела функции.

    Args:
        order_id: ID заказа.
        body: Новый статус (``new`` / ``confirmed`` / ``shipped`` / ``delivered`` /
            ``cancelled``).
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
                "is_active": p.is_active, "synced_at": p.synced_at.isoformat() if p.synced_at else None,
            }
            for p in products
        ],
        "total": total,
        "page": page,
    }


@router.post("/test-connection")
def test_connection(_=Depends(_get_current_admin)):
    """Проверяет подключение к МойСклад с сохранёнными credentials."""
    try:
        from app.integrations.moysklad.rest_client import get_organization_href
        get_organization_href()
        return {"ok": True, "message": "Подключение успешно. Организация найдена."}
    except Exception as e:
        return {"ok": False, "message": str(e)}


@router.post("/fetch-images")
def trigger_fetch_images(_=Depends(_get_current_admin)):
    """Запускает задачу загрузки изображений из МойСклад для товаров без картинок."""
    try:
        from app.tasks.sync import fetch_product_images
        fetch_product_images.delay()
        return {"message": "Задача поставлена в очередь"}
    except Exception as e:
        return {"message": f"Ошибка: {e}"}


@router.get("/store-info")
def store_info_public(db: Session = Depends(get_db)):
    """Публичный эндпойнт — название магазина для фронтенда."""
    return {"shop_name": _get_setting(db, "shop_name", "Магазин")}


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

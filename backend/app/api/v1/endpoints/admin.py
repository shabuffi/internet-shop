"""Admin panel API."""

import bcrypt
import hmac
import json
import jwt
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.db.session import get_db
from app.db.models.admin import AdminUser, ShopSettings
from app.db.models.product import Product, Category, SyncLog, SyncChange
from app.db.models.promo import PromoCategory, MoySkladProperty, product_promo_categories
from app.db.models.order import Order, OrderItem
from app.db.models.user import User as Customer
from app.schemas.auth import UserOut
from app.services import media_storage, promo_service, property_registry, top_categories
from decimal import Decimal, InvalidOperation

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
        secure=settings.COOKIE_SECURE,  # True на HTTPS-проде (COOKIE_SECURE в .env.prod)
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
def setup_admin(body: dict, request: Request, db: Session = Depends(get_db)):
    """Создаёт первого admin-пользователя (первичная установка).

    Доступ только при выполнении ВСЕХ условий:
    - задан ``SETUP_TOKEN`` в конфигурации (пустой → эндпоинт закрыт наглухо);
    - в запросе передан верный одноразовый setup-токен (тело ``setup_token`` или заголовок
      ``X-Setup-Token``), сверяется constant-time;
    - в системе ещё нет ни одного администратора.

    Как только админ создан — эндпоинт недоступен (даже с верным токеном). После установки
    значение ``SETUP_TOKEN`` следует убрать из окружения.
    """
    if not settings.SETUP_TOKEN:
        raise HTTPException(status_code=403, detail="Инициализация закрыта")
    provided = str(body.get("setup_token") or request.headers.get("X-Setup-Token", ""))
    if not hmac.compare_digest(provided, settings.SETUP_TOKEN):
        raise HTTPException(status_code=401, detail="Неверный или отсутствующий setup-токен")
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
                        samesite="lax", secure=settings.COOKIE_SECURE, max_age=COOKIE_MAX_AGE, path="/")
    return {"ok": True}


@router.post("/dev/logout")
def dev_logout(response: Response):
    """Выход со страницы «Разработчик»."""
    response.delete_cookie(DEV_COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/dev/settings")
def get_dev_settings(db: Session = Depends(get_db), _=Depends(_get_current_dev)):
    """Технические настройки: ключ сообщества ВК + SMTP + настройки сайта. Секреты маскируем."""
    return {
        "vk_group_token":     "***" if _get_setting(db, "vk_group_token") else "",
        "vk_env":             bool(settings.VK_GROUP_TOKEN and settings.VK_PEER_ID),
        "smtp_host":          _get_setting(db, "smtp_host"),
        "smtp_port":          _get_setting(db, "smtp_port", "587"),
        "smtp_user":          _get_setting(db, "smtp_user"),
        "smtp_password":      "***" if _get_setting(db, "smtp_password") else "",
        "smtp_from":          _get_setting(db, "smtp_from"),
        # ── Настройки сайта (раздел перенесён сюда, под пароль разработчика) ──
        "chat_mode":          _get_setting(db, "chat_mode", "button"),
        "chat_enabled":       _get_setting(db, "chat_enabled") == "1",
        "chat_service":       _get_setting(db, "chat_service", "vk"),
        "chat_value":         _get_setting(db, "chat_value"),
        "chat_label":         _get_setting(db, "chat_label", "Чат с менеджером"),
        "chat_vk_api_id":     _get_setting(db, "chat_vk_api_id"),
        "chat_vk_group_id":   _get_setting(db, "chat_vk_group_id"),
        "social_vk":          _get_setting(db, "social_vk"),
        "social_telegram":    _get_setting(db, "social_telegram"),
        "social_whatsapp":    _get_setting(db, "social_whatsapp"),
        "social_instagram":   _get_setting(db, "social_instagram"),
        "seo_title":          _get_setting(db, "seo_title"),
        "seo_description":    _get_setting(db, "seo_description"),
        "seo_og_title":       _get_setting(db, "seo_og_title"),
        "seo_og_description": _get_setting(db, "seo_og_description"),
        "seo_robots_index":   _get_setting(db, "seo_robots_index", "1") != "0",
        # Коды подтверждения прав в Яндекс.Вебмастере / Google Search Console (мета-теги)
        "seo_yandex_verification": _get_setting(db, "seo_yandex_verification"),
        "seo_google_verification": _get_setting(db, "seo_google_verification"),
        "theme_primary":      _get_setting(db, "theme_primary"),
    }


@router.get("/dev/diagnose-import")
def diagnose_import(db: Session = Depends(get_db), _=Depends(_get_current_dev)):
    """Диагностика последнего import.xml: что и в каких тегах прислал склад.

    Помогает понять, почему не подтянулись описание/артикул/картинки конкретного склада.
    Сохранённую копию кладёт сам обмен (exchange.py) при приёме файла.

    Returns:
        Кол-во товаров, разбор первых трёх и сырой XML первого <Товар>.
    """
    from app.core.redis_client import redis_client
    from app.integrations.moysklad.commerceml_parser import parse_import_xml
    from lxml import etree

    raw = redis_client.get("exchange:diag:import.xml")
    if not raw:
        return {"error": "Нет сохранённого import.xml — сначала запустите обмен в МойСклад, потом откройте эту страницу."}

    catalog = parse_import_xml(raw)
    # Берём в пример товары С картинками, если такие есть (иначе первые три)
    with_imgs = [p for p in catalog.products if p.images]
    sample_src = (with_imgs or catalog.products)[:3]
    sample = [
        {
            "name": p.name,
            "article": p.article,
            "has_description": bool(p.description),
            "images": p.images,
        }
        for p in sample_src
    ]

    # Сколько файлов картинок реально лежит на диске (приходят отдельными POST'ами обмена)
    try:
        media_files = os.listdir(settings.MEDIA_DIR)
    except OSError:
        media_files = []

    # Сырой XML товара, у которого есть <Картинка> (или первого)
    first_xml = None
    try:
        root = etree.fromstring(raw)
        tovars = [el for el in root.iter() if el.tag.endswith("Товар")]
        pick = next((t for t in tovars if any(c.tag.endswith("Картинка") for c in t.iter())), tovars[0] if tovars else None)
        if pick is not None:
            first_xml = etree.tostring(pick, encoding="unicode")[:4000]
    except Exception:
        pass

    # Был ли ХОТЬ ОДИН заход обмена с <Картинка> (его храним отдельно, чтобы не перезатёрся)
    raw_img = redis_client.get("exchange:diag:import_with_kartinka.xml")
    ever_sent_images = bool(raw_img)
    img_xml_sample = None
    if raw_img:
        try:
            ic = parse_import_xml(raw_img)
            wi = next((p for p in ic.products if p.images), None)
            if wi:
                img_xml_sample = {"name": wi.name, "images": wi.images}
        except Exception:
            pass

    return {
        "current_import_xml_has_kartinka": "Картинка".encode() in raw,
        "ever_received_import_with_kartinka": ever_sent_images,
        "image_in_kartinka_round_sample": img_xml_sample,
        "products": len(catalog.products),
        "products_with_images_in_xml": len(with_imgs),
        "image_files_on_disk": len(media_files),
        "image_files_sample": media_files[:5],
        "db_products": db.query(Product).count(),
        "db_products_with_image": db.query(Product).filter(Product.image_url.isnot(None)).count(),
        "sample": sample,
        "first_product_xml": first_xml,
    }


@router.delete("/dev/catalog")
def wipe_catalog(db: Session = Depends(get_db), _=Depends(_get_current_dev)):
    """Полностью очищает каталог (товары + категории) — для пере-подключения склада.

    Заказы сохраняются: ссылка ``order_items.product_id`` обнуляется (ON DELETE SET NULL),
    а снимок названия/артикула в позициях остаётся. Картинки на диске не трогаются.

    Returns:
        ``{"products": N, "categories": M}`` — сколько удалено.
    """
    n_products = db.query(Product).delete(synchronize_session=False)
    n_categories = db.query(Category).delete(synchronize_session=False)
    db.commit()
    # Чистим файлы картинок на диске — иначе «осиротевшие» от удалённых товаров копятся
    removed_files = 0
    try:
        for f in os.listdir(settings.MEDIA_DIR):
            try:
                os.remove(os.path.join(settings.MEDIA_DIR, f))
                removed_files += 1
            except OSError:
                pass
    except OSError:
        pass
    return {"products": n_products, "categories": n_categories, "files": removed_files}


@router.delete("/dev/orders")
def wipe_orders(db: Session = Depends(get_db), _=Depends(_get_current_dev)):
    """Удаляет ВСЕ заказы (и их позиции) — для очистки тестовых данных.

    Returns:
        ``{"orders": N}`` — сколько заказов удалено.
    """
    db.query(OrderItem).delete(synchronize_session=False)
    n = db.query(Order).delete(synchronize_session=False)
    db.commit()
    return {"orders": n}


@router.post("/dev/settings")
def save_dev_settings(body: dict, db: Session = Depends(get_db), _=Depends(_get_current_dev)):
    """Сохраняет технические настройки (ключ ВК + SMTP + настройки сайта). ``***`` пропускаются."""
    allowed = {
        "vk_group_token",
        "smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_from",
        # Настройки сайта (перенесены на dev-страницу)
        "chat_mode", "chat_enabled", "chat_service", "chat_value", "chat_label",
        "chat_vk_api_id", "chat_vk_group_id",
        "social_vk", "social_telegram", "social_whatsapp", "social_instagram",
        "seo_title", "seo_description", "seo_og_title", "seo_og_description", "seo_robots_index",
        "seo_yandex_verification", "seo_google_verification",
        "theme_primary",
    }
    bool_keys = {"chat_enabled", "seo_robots_index"}
    for key, value in body.items():
        if key not in allowed or value == "***":
            continue
        if key in bool_keys:
            _set_setting(db, key, "1" if value in (True, "1", "true", "on") else "0")
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
    # Статус обмена: когда МойСклад последний раз выходил на связь (мониторинг простоя)
    exchange_last_seen = None
    try:
        from app.core.redis_client import redis_client
        raw = redis_client.get("exchange:last_seen")
        if raw:
            exchange_last_seen = raw.decode() if isinstance(raw, bytes) else raw
    except Exception:
        pass
    return {
        "exchange_last_seen": exchange_last_seen,
        "shop_name":          _get_setting(db, "shop_name", "Магазин"),
        # Контакты в футере сайта (видны покупателям)
        "contact_phone":      _get_setting(db, "contact_phone"),
        "contact_email":      _get_setting(db, "contact_email"),
        "contact_hours":      _get_setting(db, "contact_hours"),
        # Реквизиты компании (страницы «О компании» / «Контакты», футер)
        "company_legal_name": _get_setting(db, "company_legal_name"),
        "company_inn":        _get_setting(db, "company_inn"),
        "company_ogrn":       _get_setting(db, "company_ogrn"),
        "warehouse_address":  _get_setting(db, "warehouse_address"),
        # Координаты склада «широта, долгота» — для чистой метки на карте (без поиска)
        "warehouse_coords":   _get_setting(db, "warehouse_coords"),
        # Условия доставки — единый текст для всех товаров (показывается на карточке товара)
        "delivery_info":      _get_setting(db, "delivery_info"),
        # Логотип в шапке (загружается отдельной кнопкой)
        "has_logo":           bool(_get_setting(db, "logo_file")),
        # Обмен с МойСклад — выдуманная пара логин/пароль (не от аккаунта МойСклад)
        "exchange_login":     _get_setting(db, "exchange_login"),
        "exchange_password":  "***" if _get_setting(db, "exchange_password") else "",
        # «Внешний код» единого контрагента для гостевых заказов (без регистрации)
        "guest_moysklad_ext_code": _get_setting(db, "guest_moysklad_ext_code"),
        # Владелец вводит свой id ВК и email; ключ сообщества/SMTP — на странице разработчика
        "vk_peer_id":         _get_setting(db, "vk_peer_id"),
        "notify_email":       _get_setting(db, "notify_email"),
        # «Техническую часть» канала (ключ ВК / SMTP) задал разработчик?
        "vk_ready":           bool(vk["vk_token"]),
        "email_ready":        bool(smtp["host"] and smtp["user"] and smtp["password"]),
        # Показ остатка на витрине: «N шт.» (по умолчанию) или только «В наличии»
        "show_stock_qty":     _get_setting(db, "show_stock_qty", "1") != "0",
        # Сортировка категорий каталога: «moysklad» (порядок МойСклад) или «alpha» (алфавит)
        "category_sort":      _get_setting(db, "category_sort", "moysklad"),
        # Единый поиск: «1» — поиск только на «Каталоге» (по умолчанию), «0» — своя строка на каждой странице
        "unified_search":     _get_setting(db, "unified_search", "1") != "0",
        # Источник блока «Топ категорий» на главной: «1» — новая система из админки (по умолчанию),
        # «0» — старые встроенные (захардкоженные) плитки.
        "top_categories_admin": _get_setting(db, "top_categories_admin", "1") != "0",
        # Доп-поле МойСклад со «старой ценой» (для зачёркнутой цены): ИД строки реестра, а не
        # имя — имя резолвится через реестр, поэтому переименование поля ничего не ломает.
        # Выбирается владельцем из выпадающего списка на странице «Промо-разделы».
        # Пусто — фича выключена.
        "promo_old_price_field_id": _get_setting(db, promo_service.OLD_PRICE_SETTING_KEY),
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
        "company_legal_name", "company_inn", "company_ogrn", "warehouse_address",
        "warehouse_coords",
        "delivery_info",
        # обмен с МойСклад + личные идентификаторы получателя (id ВК, email)
        "exchange_login", "exchange_password",
        "vk_peer_id", "notify_email",
        # единый контрагент для гостевых заказов (внешний код из МойСклад)
        "guest_moysklad_ext_code",
        # показ остатка на витрине («1» — «N шт.», «0» — «В наличии»)
        "show_stock_qty",
        # сортировка категорий каталога («moysklad» / «alpha»)
        "category_sort",
        # единый поиск («1» — только на «Каталоге», «0» — своя строка на каждой странице)
        "unified_search",
        # источник блока «Топ категорий» («1» — новая система из админки, «0» — старые встроенные плитки)
        "top_categories_admin",
        # доп-поле МойСклад со «старой ценой»: ид строки реестра (страница «Промо-разделы»);
        # пусто — выключено
        promo_service.OLD_PRICE_SETTING_KEY,
    }
    # Настройки сайта (чат/соцсети/SEO/тема) перенесены на dev-страницу — см. save_dev_settings.
    for key, value in body.items():
        if key not in allowed or value == "***":
            continue
        # exchange_password — входящий секрет обмена: храним bcrypt-хеш, не открытый текст
        if key == "exchange_password":
            _set_setting(db, key, _hash_password(str(value)))
        else:
            _set_setting(db, key, str(value))
    db.commit()
    return {"message": "Настройки сохранены"}


# ─── Политика обработки ПД (редактор + реквизиты) ──────────────────

@router.get("/policy")
def get_policy(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Текущая политика для редактора админки: тело, дата редакции, реквизиты."""
    from app.services.legal_content import get_privacy
    return get_privacy(db)


@router.post("/policy")
def save_policy(body: dict, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Сохраняет политику: тело + дату редакции + реквизиты оператора.

    Реквизиты пишутся в те же ключи настроек магазина (``company_legal_name`` и т.п.),
    что и страница настроек, — данные едины для всего сайта.

    Args:
        body: ``{body, revision, operator: {name, inn, ogrn, address, email, phone}}``.
    """
    from app.services.legal_content import OPERATOR_KEYS
    if "body" in body:
        _set_setting(db, "privacy_body", str(body["body"]))
    if "revision" in body:
        _set_setting(db, "privacy_revision", str(body["revision"]))
    operator = body.get("operator") or {}
    for field, key in OPERATOR_KEYS.items():
        if field in operator:
            _set_setting(db, key, str(operator[field]))
    db.commit()
    return {"message": "Политика сохранена"}


# ─── Инфо-страницы «Оформление заказа» / «Оплата» (редактор) ──────────

@router.get("/info-pages")
def get_info_pages_admin(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Тексты редактируемых инфо-страниц (order/payment) для редактора админки."""
    from app.services.legal_content import get_info_pages
    return get_info_pages(db)


@router.post("/info-pages")
def save_info_pages(body: dict, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Сохраняет тела инфо-страниц. body: {order_info_body?, payment_body?}."""
    for key in ("order_info_body", "payment_body"):
        if key in body:
            _set_setting(db, key, str(body[key]))
    db.commit()
    return {"message": "Сохранено"}


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

    # Метки обмена из Redis: последний контакт МойСклад и последняя синхронизация заказов.
    from app.core.redis_client import redis_client
    def _redis_str(key):
        try:
            v = redis_client.get(key)
            return v.decode() if isinstance(v, bytes) else v
        except Exception:
            return None

    return {
        "product_count": product_count,
        "order_count":   order_count,
        "last_sync": {
            "status":            last_sync.status if last_sync else None,
            "products_created":  last_sync.products_created if last_sync else 0,
            "products_updated":  last_sync.products_updated if last_sync else 0,
            "finished_at":       last_sync.finished_at.isoformat() if last_sync and last_sync.finished_at else None,
        } if last_sync else None,
        # Последний контакт МойСклад (любой обмен) и последняя синхронизация заказов (orders.xml)
        "last_exchange_seen":  _redis_str("exchange:last_seen"),
        "last_orders_sync":    _redis_str("exchange:last_orders_sync"),
    }


@router.get("/orders")
def list_orders(
    page: int = 1,
    user_id: str | None = None,
    phone: str | None = None,
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
    """Список заказов для админки.

    Без фильтров — постранично (по 20). С ``user_id`` (карточка зарегистрированного
    клиента) или ``phone`` (история гостя по телефону) — все заказы этого покупателя,
    без пагинации.

    Args:
        page: Номер страницы (с 1); игнорируется при фильтре по клиенту.
        user_id: Показать только заказы этого аккаунта.
        phone: Показать только заказы с этим телефоном (в т.ч. гостевые).

    Returns:
        Словарь с заказами (число позиций, признак гостя ``is_guest``), общим числом и
        номером страницы.
    """
    from sqlalchemy import func
    from sqlalchemy.orm import joinedload
    PAGE = 20
    filtered = bool(user_id or phone)
    # .unique() обязателен: joinedload коллекции (Order.items) даёт дублирующиеся строки,
    # и без unique() SQLAlchemy 2.0 кидает InvalidRequestError (иначе /orders падал 500,
    # а фронт молча показывал «0 всего»).
    q = select(Order).options(joinedload(Order.items)).order_by(Order.created_at.desc())
    count_q = select(func.count()).select_from(Order)
    if user_id:
        q = q.where(Order.user_id == user_id)
        count_q = count_q.where(Order.user_id == user_id)
    if phone:
        q = q.where(Order.customer_phone == phone)
        count_q = count_q.where(Order.customer_phone == phone)
    if not filtered:
        q = q.offset((page - 1) * PAGE).limit(PAGE)
    orders = db.scalars(q).unique().all()
    total = db.scalar(count_q)

    return {
        "items": [
            {
                "id": o.id, "number": o.number, "status": o.status,
                "moysklad_status": o.moysklad_status,
                "customer_name": o.customer_name, "customer_phone": o.customer_phone,
                "user_id": o.user_id, "is_guest": o.user_id is None,
                "total_amount": str(o.total_amount),
                "exported_at": o.exported_at.isoformat() if o.exported_at else None,
                "created_at": o.created_at.isoformat(),
                "items_count": len(o.items),
                # Состав заказа — чтобы в админке было видно, что именно заказывали
                "items": [
                    {
                        "product_name": it.product_name,
                        "product_article": it.product_article,
                        "price": str(it.price),
                        "quantity": it.quantity,
                    }
                    for it in o.items
                ],
            }
            for o in orders
        ],
        "total": total,
        "page": page,
    }


# Статус заказа ведётся в МойСклад (приходит обратно в orders.xml, см. exchange.py) —
# на сайте его НЕ меняем. Прежний ручной PATCH /orders/{id}/status удалён.


@router.get("/products")
def list_products_admin(
    page: int = 1,
    q: str | None = None,
    photo: str | None = None,   # with | without — есть/нет картинки
    desc: str | None = None,    # with | without — есть/нет описания
    avail: str | None = None,   # yes | no — в наличии / нет
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
    """Список товаров для админки с пагинацией (по 50), поиском и фильтрами.

    Показывает ВСЕ товары (без фильтра по остатку/активности) — в отличие от витрины.
    Фильтры помогают находить пробелы каталога: товары без картинок/описаний/не в наличии.

    Args:
        page: Номер страницы (с 1).
        q: Строка поиска по названию или артикулу (необязательно).
        photo: ``with`` — только с картинкой, ``without`` — только без.
        desc: ``with`` — только с описанием, ``without`` — только без.
        avail: ``yes`` — только в наличии, ``no`` — только не в наличии.
        db: Сессия БД.

    Returns:
        Словарь с товарами текущей страницы, общим числом (с учётом фильтров),
        размером страницы и номером страницы.
    """
    PAGE = 50
    stmt = select(Product)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Product.name.ilike(like), Product.article.ilike(like)))

    _has_image = Product.image_url.isnot(None) & (Product.image_url != "")
    if photo == "with":
        stmt = stmt.where(_has_image)
    elif photo == "without":
        stmt = stmt.where(~_has_image)

    _has_desc = Product.description.isnot(None) & (Product.description != "")
    if desc == "with":
        stmt = stmt.where(_has_desc)
    elif desc == "without":
        stmt = stmt.where(~_has_desc)

    # «В наличии» = показан на сайте (available) И есть реальный остаток (stock > 0) —
    # так же, как теперь считается наличие в таблице/на витрине.
    if avail == "yes":
        stmt = stmt.where(Product.available == True, Product.stock > 0)
    elif avail == "no":
        stmt = stmt.where(or_(Product.available == False, Product.stock <= 0))

    products = db.scalars(
        stmt.order_by(Product.name).offset((page - 1) * PAGE).limit(PAGE)
    ).all()
    total = db.scalar(
        select(__import__("sqlalchemy", fromlist=["func"]).func.count())
        .select_from(stmt.order_by(None).subquery())
    )

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
        "page_size": PAGE,
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


# ─── Бесхозные изображения (локальная медиа-библиотека) ────────────


def _used_image_names(db: Session) -> tuple[set[str], str]:
    """Имена картинок, уже занятые товарами, и «сырой» текст настроек магазина.

    Настройки (логотип, баннеры, бренды) хранят имена файлов внутри строк/JSON,
    поэтому проверяем вхождением подстроки, а не точным совпадением.
    """
    used: set[str] = set()
    for images, image_url in db.execute(select(Product.images, Product.image_url)):
        used.update(images or [])
        if image_url:
            used.add(image_url)
    # Иконки промо-категорий — тоже «занятые» файлы (иначе попали бы в «бесхозные»).
    # Через icon_file_name, а не сырым значением: иконка кодируется как
    # "upload:<файл>:<цвет>", и сырая строка с именем файла на диске не совпадёт.
    for (icon,) in db.execute(select(PromoCategory.icon)):
        file_name = promo_service.icon_file_name(icon)
        if file_name:
            used.add(file_name)
    blob = "\n".join(v or "" for (v,) in db.execute(select(ShopSettings.value)))
    return used, blob


@router.get("/media/orphans")
def list_orphan_images(
    q: str | None = None,
    sort: str = "date",       # date | name | size
    order: str = "desc",      # desc | asc
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
    """Картинки в медиа-хранилище, не привязанные ни к одному товару и не занятые настройками.

    Args:
        q: Поиск по имени файла.
        sort: Сортировка — ``date`` (по дате файла), ``name``, ``size``.
        order: Направление — ``desc`` (по умолчанию) или ``asc``.
        page: Номер страницы (с 1).
        page_size: Размер страницы.

    Returns:
        ``{"items": [{filename, size, mtime}], "total": N, "page": N, "page_size": N}``.
    """
    used, settings_blob = _used_image_names(db)
    try:
        names = os.listdir(settings.MEDIA_DIR)
    except OSError:
        names = []

    items: list[dict] = []
    for name in names:
        if not media_storage.is_image_filename(name) or name in used or name in settings_blob:
            continue
        try:
            st = os.stat(os.path.join(settings.MEDIA_DIR, name))
        except OSError:
            continue
        items.append({
            "filename": name,
            "size": st.st_size,
            "mtime": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
        })

    if q and q.strip():
        needle = q.strip().lower()
        items = [i for i in items if needle in i["filename"].lower()]

    key = {"name": "filename", "size": "size"}.get(sort, "mtime")
    items.sort(key=lambda i: i[key], reverse=(order != "asc"))

    total = len(items)
    start = max(0, (page - 1) * page_size)
    return {
        "items": items[start:start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/media/file/{filename}")
def get_media_file(
    filename: str,
    _=Depends(_get_current_admin),
):
    """Отдаёт файл картинки из медиа-хранилища по имени (превью в библиотеке админки)."""
    found = media_storage.read_image(filename)
    if not found:
        raise HTTPException(status_code=404, detail="Файл не найден")
    data, content_type = found
    return Response(content=data, media_type=content_type)


class AttachImage(BaseModel):
    filename: str


@router.post("/products/{product_id}/images/attach")
def attach_existing_image(
    product_id: str,
    body: AttachImage,
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
    """Привязывает уже лежащий в хранилище файл (бесхозную картинку) к товару.

    Новых файлов не создаёт — переиспользует существующий. Ставит ``images_manual``,
    чтобы обмен МойСклад не перезаписал картинки этого товара.

    Returns:
        ``{"images": [...]}`` — обновлённый список картинок товара.

    Raises:
        HTTPException: 404 — товар или файл не найден.
    """
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Товар не найден")
    name = os.path.basename(body.filename.replace("\\", "/"))
    if not media_storage.is_image_filename(name) or not media_storage.read_image(name):
        raise HTTPException(status_code=404, detail="Файл не найден")

    images = _current_images(product)
    if name not in images:
        images.append(name)
    product.images = images
    product.image_url = images[0]
    product.images_manual = True
    db.commit()
    return {"images": product.images}


@router.get("/store-info")
def store_info_public(db: Session = Depends(get_db)):
    """Публичный эндпойнт — настройки сайта для фронтенда (шапка/футер/чат/SEO/тема)."""
    return {
        "shop_name":          _get_setting(db, "shop_name", "Магазин"),
        "contact_phone":      _get_setting(db, "contact_phone"),
        "contact_email":      _get_setting(db, "contact_email"),
        "contact_hours":      _get_setting(db, "contact_hours"),
        "company_legal_name": _get_setting(db, "company_legal_name"),
        "company_inn":        _get_setting(db, "company_inn"),
        "company_ogrn":       _get_setting(db, "company_ogrn"),
        "warehouse_address":  _get_setting(db, "warehouse_address"),
        "warehouse_coords":   _get_setting(db, "warehouse_coords"),
        "delivery_info":      _get_setting(db, "delivery_info"),
        "has_logo":           bool(_get_setting(db, "logo_file")),
        # Чат с менеджером
        "chat_mode":          _get_setting(db, "chat_mode", "button"),
        "chat_enabled":       _get_setting(db, "chat_enabled") == "1",
        "chat_service":       _get_setting(db, "chat_service", "vk"),
        "chat_value":         _get_setting(db, "chat_value"),
        "chat_label":         _get_setting(db, "chat_label", "Чат с менеджером"),
        "chat_vk_api_id":     _get_setting(db, "chat_vk_api_id"),
        "chat_vk_group_id":   _get_setting(db, "chat_vk_group_id"),
        # Соцсети
        "social_vk":          _get_setting(db, "social_vk"),
        "social_telegram":    _get_setting(db, "social_telegram"),
        "social_whatsapp":    _get_setting(db, "social_whatsapp"),
        "social_instagram":   _get_setting(db, "social_instagram"),
        # SEO (пустые → фронт берёт свои фолбэки)
        "seo_title":          _get_setting(db, "seo_title"),
        "seo_description":    _get_setting(db, "seo_description"),
        "seo_og_title":       _get_setting(db, "seo_og_title"),
        "seo_og_description": _get_setting(db, "seo_og_description"),
        # Индексация по умолчанию включена; "0" — выключить
        "seo_robots_index":   _get_setting(db, "seo_robots_index", "1") != "0",
        # Коды подтверждения прав (мета-теги в <head>)
        "seo_yandex_verification": _get_setting(db, "seo_yandex_verification"),
        "seo_google_verification": _get_setting(db, "seo_google_verification"),
        # Тема
        "theme_primary":      _get_setting(db, "theme_primary"),
        # Баннеры слайдера (в каталоге): включён ли показ + JSON-массив (по умолчанию выкл.)
        "banners_enabled":    _get_setting(db, "banners_enabled", "0") == "1",
        "home_banners":       _get_setting(db, "home_banners"),
        # Логотипы брендов для слайдера на главной (JSON-массив [{id, image}])
        "brands":             _get_setting(db, "brands"),
        # Показывать точный остаток «N шт.» (1, по умолчанию) или только «В наличии» (0)
        "show_stock_qty":     _get_setting(db, "show_stock_qty", "1") != "0",
        # Единый поиск: «1» — поиск только на «Каталоге» (по умолчанию), «0» — своя строка на каждой странице
        "unified_search":     _get_setting(db, "unified_search", "1") != "0",
        # Источник блока «Топ категорий» на главной: «1» — новая система из админки (по умолчанию),
        # «0» — старые встроенные (захардкоженные) плитки.
        "top_categories_admin": _get_setting(db, "top_categories_admin", "1") != "0",
    }


# ─── Логотип магазина ──────────────────────────────────────────────

@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
    """Загружает логотип магазина (показывается в шапке вместо названия)."""
    data = await file.read()
    try:
        name = media_storage.save_upload(file.filename or "logo.png", data)
    except ValueError:
        raise HTTPException(status_code=400, detail="Можно загружать только изображения")
    old = _get_setting(db, "logo_file")
    if old and old.startswith("upload_"):
        media_storage.delete_image(old)
    _set_setting(db, "logo_file", name)
    db.commit()
    return {"ok": True}


@router.delete("/logo")
def delete_logo(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Убирает логотип (в шапке снова показывается название)."""
    old = _get_setting(db, "logo_file")
    if old and old.startswith("upload_"):
        media_storage.delete_image(old)
    _set_setting(db, "logo_file", "")
    db.commit()
    return {"ok": True}


@router.get("/logo")
def get_logo(db: Session = Depends(get_db)):
    """Публичная отдача логотипа магазина (для шапки сайта)."""
    name = _get_setting(db, "logo_file")
    result = media_storage.read_image(name) if name else None
    if result is None:
        raise HTTPException(status_code=404, detail="Логотип не задан")
    data, content_type = result
    return Response(content=data, media_type=content_type,
                    headers={"Cache-Control": "public, max-age=300"})


# ─── Загрузка изображений (баннеры и т.п.) ─────────────────────────

@router.post("/dev/upload-image")
async def dev_upload_image(file: UploadFile = File(...), _=Depends(_get_current_dev)):
    """Загружает изображение (для баннеров) и возвращает URL его отдачи.

    Файл кладётся в общее медиа-хранилище; ссылка вида ``/api/v1/admin/media/<name>``
    подставляется в поле картинки баннера. Только для разработчика.
    """
    data = await file.read()
    try:
        name = media_storage.save_upload(file.filename or "banner.jpg", data)
    except ValueError:
        raise HTTPException(status_code=400, detail="Можно загружать только изображения")
    return {"name": name, "url": f"/api/v1/admin/media/{name}"}


@router.get("/media/{name}")
def get_media(name: str):
    """Публичная отдача загруженного изображения по имени файла."""
    result = media_storage.read_image(name)
    if result is None:
        raise HTTPException(status_code=404, detail="Файл не найден")
    data, content_type = result
    return Response(content=data, media_type=content_type,
                    headers={"Cache-Control": "public, max-age=300"})


# ─── Баннеры слайдера (управляет владелец из обычной админки) ───────

@router.get("/banners")
def get_banners(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Настройки слайдера баннеров для владельца: вкл/выкл + JSON-массив баннеров."""
    return {
        "banners_enabled": _get_setting(db, "banners_enabled", "0") == "1",
        "home_banners":    _get_setting(db, "home_banners"),
    }


@router.post("/banners")
def save_banners(body: dict, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Сохраняет настройки слайдера (владелец)."""
    if "banners_enabled" in body:
        _set_setting(db, "banners_enabled",
                     "1" if body["banners_enabled"] in (True, "1", "true", "on") else "0")
    if "home_banners" in body:
        _set_setting(db, "home_banners", str(body["home_banners"]))
    db.commit()
    return {"message": "Баннеры сохранены"}


@router.post("/banner-image")
async def upload_banner_image(file: UploadFile = File(...), _=Depends(_get_current_admin)):
    """Загрузка картинки баннера владельцем; возвращает URL отдачи."""
    data = await file.read()
    try:
        name = media_storage.save_upload(file.filename or "banner.jpg", data)
    except ValueError:
        raise HTTPException(status_code=400, detail="Можно загружать только изображения")
    return {"name": name, "url": f"/api/v1/admin/media/{name}"}


# ─── Бренды (логотипы для слайдера на главной; управляет владелец) ───

def _load_brands(db: Session) -> list[dict]:
    """Список брендов из ShopSettings (`brands`) — массив {id, image} по порядку показа."""
    raw = _get_setting(db, "brands")
    try:
        data = json.loads(raw) if raw else []
    except (ValueError, TypeError):
        return []
    return [b for b in data if isinstance(b, dict) and b.get("image")] if isinstance(data, list) else []


@router.get("/brands")
def get_brands(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Логотипы брендов (владелец) — упорядоченный список {id, image}."""
    return {"brands": _load_brands(db)}


@router.post("/brands/upload")
async def upload_brand(file: UploadFile = File(...), _=Depends(_get_current_admin)):
    """Загружает логотип бренда; возвращает {id, image}. Клиент добавляет его в список и сохраняет
    через POST /brands. PNG с прозрачным фоном/JPG — на витрине показываются как есть (без плашки)."""
    data = await file.read()
    try:
        name = media_storage.save_upload(file.filename or "brand.png", data)
    except ValueError:
        raise HTTPException(status_code=400, detail="Можно загружать только изображения")
    return {"id": uuid.uuid4().hex, "image": name}


@router.post("/brands")
def save_brands(body: dict, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Сохраняет упорядоченный список брендов. Файлы, пропавшие из списка (удалённые логотипы),
    стираются с диска."""
    incoming = body.get("brands") or []
    clean = [
        {"id": str(b.get("id") or uuid.uuid4().hex), "image": str(b["image"])}
        for b in incoming if isinstance(b, dict) and b.get("image")
    ]
    old_files = {b["image"] for b in _load_brands(db)}
    new_files = {b["image"] for b in clean}
    for f in old_files - new_files:
        if f.startswith("upload_"):
            media_storage.delete_image(f)
    _set_setting(db, "brands", json.dumps(clean, ensure_ascii=False))
    db.commit()
    return {"brands": clean}


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
            "changes_only": l.changes_only,
            "products_in_xml": l.products_in_xml,
            "has_xml": bool(l.xml_file),
        }
        for l in logs
    ]


def _sync_log_or_404(db: Session, sync_id: int) -> SyncLog:
    log = db.get(SyncLog, sync_id)
    if not log:
        raise HTTPException(status_code=404, detail="Синхронизация не найдена")
    return log


@router.get("/sync-logs/{sync_id}")
def sync_log_detail(sync_id: int, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Сводка одного обмена: журнал + сколько товаров создано/изменено/без изменений."""
    log = _sync_log_or_404(db, sync_id)
    counts = dict(
        db.query(SyncChange.action, func.count(SyncChange.id))
        .filter(SyncChange.sync_log_id == sync_id)
        .group_by(SyncChange.action)
        .all()
    )
    return {
        "id": log.id, "source": log.source, "status": log.status,
        "products_created": log.products_created, "products_updated": log.products_updated,
        "error_message": log.error_message,
        "started_at": log.started_at.isoformat(),
        "finished_at": log.finished_at.isoformat() if log.finished_at else None,
        "changes_only": log.changes_only,
        "products_in_xml": log.products_in_xml,
        "has_xml": bool(log.xml_file),
        "counts": {
            "created": counts.get("created", 0),
            "updated": counts.get("updated", 0),
            "skipped": counts.get("skipped", 0),
        },
    }


@router.get("/sync-logs/{sync_id}/changes")
def sync_log_changes(sync_id: int, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Товары, участвовавшие в обмене: что за изменение, какие поля, какие картинки пришли."""
    _sync_log_or_404(db, sync_id)
    rows = db.scalars(
        select(SyncChange)
        .where(SyncChange.sync_log_id == sync_id)
        .order_by(SyncChange.action, SyncChange.id)
    ).all()
    return [
        {
            "id": r.id, "product_id": r.product_id, "moysklad_id": r.moysklad_id,
            "name": r.name, "action": r.action,
            "changed_fields": r.changed_fields or {},
            "has_image_field": r.has_image_field,
            "images_in_xml": r.images_in_xml or [],
        }
        for r in rows
    ]


@router.get("/sync-logs/{sync_id}/xml")
def sync_log_xml_download(sync_id: int, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Отдаёт файлом сохранённую копию import.xml всего обмена (скачивание из админки)."""
    from app.services.import_service import read_sync_xml

    log = _sync_log_or_404(db, sync_id)
    raw = read_sync_xml(log)
    if not raw:
        raise HTTPException(status_code=404, detail="Копия import.xml этого обмена не сохранена")
    return Response(
        content=raw,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{log.xml_file}"'},
    )


@router.get("/sync-logs/{sync_id}/products/{moysklad_id}/xml", response_class=PlainTextResponse)
def sync_log_product_xml(sync_id: int, moysklad_id: str,
                         db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Отдаёт кусок `<Товар>` из сохранённой копии import.xml этого обмена."""
    from lxml import etree
    from app.services.import_service import read_sync_xml

    log = _sync_log_or_404(db, sync_id)
    raw = read_sync_xml(log)
    if not raw:
        raise HTTPException(status_code=404, detail="Копия import.xml этого обмена не сохранена")
    root = etree.fromstring(raw)
    for t in (e for e in root.iter() if e.tag.endswith("Товар")):
        ident = next((c.text for c in t.iter() if c.tag.endswith("Ид")), None)
        if ident == moysklad_id:
            return etree.tostring(t, encoding="unicode", pretty_print=True)
    raise HTTPException(status_code=404, detail="Товар не найден в XML этого обмена")


# ─── Покупатели (личные кабинеты) ──────────────────────────────────

# Допустимый диапазон персональной корректировки цены: −30%…+9% (по умолчанию 0% —
# зарегистрированный платит базовую цену X; гость видит X + наценка DEFAULT_MARKUP_PERCENT).
DISCOUNT_MIN = Decimal("-30")
DISCOUNT_MAX = Decimal("9")


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Все зарегистрированные покупатели (новые сверху) — для назначения скидок."""
    return db.scalars(select(Customer).order_by(Customer.created_at.desc())).all()


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
    """Частичное обновление покупателя: скидка / активация / внешний код МойСклад.

    Обновляются только переданные поля:
    - ``discount_percent`` — корректировка цены −30…+9 (% от базовой МойСклад);
    - ``is_active`` — активация аккаунта (доступ к ЛК);
    - ``moysklad_ext_code`` — «Внешний код» контрагента (привязка к существующему в МойСклад).

    Raises:
        HTTPException: 404, если покупатель не найден; 422, если скидка вне диапазона.
    """
    user = db.scalar(select(Customer).where(Customer.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="Покупатель не найден")

    if "discount_percent" in body:
        try:
            pct = Decimal(str(body.get("discount_percent"))).quantize(Decimal("0.01"))
        except (InvalidOperation, TypeError):
            raise HTTPException(status_code=422, detail="Неверное значение скидки")
        if pct < DISCOUNT_MIN or pct > DISCOUNT_MAX:
            raise HTTPException(status_code=422, detail="Скидка должна быть от −30% до +9%")
        user.discount_percent = pct

    if "is_active" in body:
        user.is_active = bool(body["is_active"])

    if "moysklad_ext_code" in body:
        code = (str(body["moysklad_ext_code"]) or "").strip()
        if code:
            # Один «Внешний код» = один контрагент = один покупатель. Не даём привязать
            # тот же код к другому клиенту (иначе их заказы уйдут на одного контрагента).
            dup = db.scalar(select(Customer).where(
                Customer.moysklad_ext_code == code, Customer.id != user_id))
            if dup:
                raise HTTPException(
                    status_code=409,
                    detail=f"Этот «Внешний код» уже стоит у покупателя «{dup.customer_name}»")
        user.moysklad_ext_code = code or None

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Удаляет покупателя (только для админа).

    Заказы покупателя сохраняются: ссылка ``orders.user_id`` обнуляется явно
    (заказ становится «гостевым»), затем удаляется сам аккаунт.

    Raises:
        HTTPException: 404, если покупатель не найден.
    """
    user = db.get(Customer, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Покупатель не найден")
    # Отвязываем заказы (не удаляем их) — история заказов остаётся в системе
    for o in db.scalars(select(Order).where(Order.user_id == user_id)):
        o.user_id = None
    db.delete(user)
    db.commit()
    return {"message": "Покупатель удалён", "id": user_id}


# ─── Промо-категории (управляет владелец; только бизнес-настройки) ───

@router.get("/moysklad-properties")
def list_moysklad_properties(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Реестр доп-полей МойСклад — источник выпадающего списка при выборе поля категории.

    Имя поля вводить руками нельзя: владелец выбирает из этого списка. Реестр наполняется сам
    на каждом обмене (запросить список у МойСклад невозможно — CommerceML работает только на
    приём, инициатор всегда МойСклад).

    Поля-«галочки» идут первыми — это подсказка, а не фильтр: выбрать можно любое поле.
    """
    from app.schemas.promo import MoySkladPropertyOut

    counts = property_registry.product_counts(db)
    flag_like = property_registry.flag_like_names(db)
    taken = {
        pid: title for pid, title in db.execute(
            select(PromoCategory.source_field_id, PromoCategory.title)
            .where(PromoCategory.source_field_id.isnot(None))
        ).all()
    }
    out = []
    for p in db.query(MoySkladProperty).all():
        item = MoySkladPropertyOut.model_validate(p)
        item.product_count = counts.get(p.name, 0)
        item.looks_like_flag = p.name in flag_like
        item.taken_by = taken.get(p.id)
        out.append(item)
    # Сначала похожие на галочку, внутри — по убыванию заполненности, затем по имени.
    out.sort(key=lambda i: (not i.looks_like_flag, -i.product_count, i.name))
    return out


@router.get("/promo-categories")
def list_promo_categories_admin(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Все промо-категории для админки. Два числа на карточку — разной природы:

    ``product_count`` — сколько товаров ПОПАДЁТ в раздел: активные с включённой галочкой в
    выбранном доп-поле (а не по таблице членства — членство пересобирает только обмен, поэтому
    сразу после смены поля бейдж показывал бы состав по старому полю). У категории без поля
    (``source_field_id`` NULL) считать по полю нечего — берём размер её членства.

    ``visible_count`` — сколько СЕЙЧАС видно на сайте: точное число со страницы раздела. Товар
    попадает сюда, если он в членстве, активен, с остатком > 0 и не ушёл в более «сильную»
    активную категорию — тот же ``featured``-фильтр, что в products.py. Отсюда честная картина
    «в поле 37, а на сайте 0» у распроданного раздела: остаток в первое число намеренно не
    входит (он временный), а второе показывает фактическую витрину.
    """
    from app.schemas.promo import PromoCategoryAdmin
    membership = dict(
        db.execute(
            select(product_promo_categories.c.promo_category_id, func.count())
            .join(Product, Product.id == product_promo_categories.c.product_id)
            .where(Product.is_active == True)   # noqa: E712 — архивных на витрине нет
            .group_by(product_promo_categories.c.promo_category_id)
        ).all()
    )
    by_field = property_registry.product_counts(db)

    # «На сайте»: повторяет featured-фильтр витрины (см. products.py). Эксклюзивность —
    # товар уходит в сильнейшую активную категорию (меньший priority) и из слабых пропадает.
    ppc = product_promo_categories
    stronger_cat = aliased(PromoCategory)
    s = ppc.alias("s")
    stronger = (
        select(1)
        .select_from(s.join(stronger_cat, stronger_cat.id == s.c.promo_category_id))
        .where(s.c.product_id == ppc.c.product_id,
               stronger_cat.is_active == True,                        # noqa: E712
               stronger_cat.priority < PromoCategory.priority)
    )
    visible = dict(
        db.execute(
            select(ppc.c.promo_category_id, func.count())
            .select_from(
                ppc.join(Product, Product.id == ppc.c.product_id)
                   .join(PromoCategory, PromoCategory.id == ppc.c.promo_category_id))
            .where(PromoCategory.is_active == True,                   # noqa: E712
                   Product.is_active == True,                         # noqa: E712
                   Product.stock > 0,
                   ~stronger.exists())
            .group_by(ppc.c.promo_category_id)
        ).all()
    )

    cats = db.query(PromoCategory).order_by(
        PromoCategory.display_order.asc(), PromoCategory.title.asc()
    ).all()
    out = []
    for c in cats:
        item = PromoCategoryAdmin.model_validate(c)
        item.product_count = (
            by_field.get(c.source_field_name or "", 0) if c.source_field_id
            else membership.get(c.id, 0)
        )
        item.visible_count = visible.get(c.id, 0)
        out.append(item)
    return out


def _check_source_field(db: Session, source_field_id: str | None, exclude_id: str | None = None):
    """Проверяет, что поле существует в реестре и не занято другой категорией.

    Занятость проверяем и здесь (чтобы отдать понятный текст), и полагаемся на UNIQUE в БД:
    между проверкой и записью два админа могут вклиниться (см. IntegrityError → 409 ниже).
    """
    if source_field_id is None:
        return
    if not db.get(MoySkladProperty, source_field_id):
        raise HTTPException(status_code=400, detail="Доп-поле МойСклад не найдено")
    q = db.query(PromoCategory).filter(PromoCategory.source_field_id == source_field_id)
    if exclude_id:
        q = q.filter(PromoCategory.id != exclude_id)
    taken = q.first()
    if taken:
        raise HTTPException(
            status_code=409,
            detail=f"Поле уже используется категорией «{taken.title}»",
        )


@router.post("/promo-categories")
def create_promo_category(
    body: dict, db: Session = Depends(get_db), _=Depends(_get_current_admin)
):
    """Создаёт промо-категорию: название + выбранное из списка доп-поле МойСклад.

    Новая категория НЕактивна и скрыта — safe-by-default: витрина не меняется, пока владелец
    не настроит и не включит. slug генерируется из title (не показывается и не редактируется).
    """
    from app.schemas.promo import PromoCategoryCreate
    data = PromoCategoryCreate(**body)
    title = (data.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Укажите название категории")
    _check_source_field(db, data.source_field_id)

    taken_slugs = {s for (s,) in db.query(PromoCategory.slug).all()}
    next_order = (db.query(func.max(PromoCategory.display_order)).scalar() or -1) + 1
    next_prio = (db.query(func.max(PromoCategory.priority)).scalar() or -1) + 1
    cat = PromoCategory(
        id=str(uuid.uuid4()),
        source_field_id=data.source_field_id,
        slug=promo_service.unique_slug(promo_service.slugify(title), taken_slugs),
        title=title,
        subtitle=(data.subtitle or None),
        display_order=next_order,
        priority=next_prio,
        is_active=False,
    )
    db.add(cat)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Поле уже используется другой категорией")
    return {"message": "Категория создана", "id": cat.id}


@router.patch("/promo-categories/{cat_id}")
def update_promo_category(
    cat_id: str, body: dict, db: Session = Depends(get_db), _=Depends(_get_current_admin)
):
    """Правит настройки категории. slug через API не меняется (публичные URL стабильны).

    Файл иконки при смене НЕ удаляется: картинка живёт в библиотеке
    (``promo.icon_library``) и может стоять сразу у нескольких разделов — удаление здесь
    погасило бы бейдж у соседей. Библиотекой управляет DELETE /promo-icons/{name},
    который сначала проверяет, что иконку никто не занял.
    """
    from app.schemas.promo import PromoCategoryUpdate
    cat = db.get(PromoCategory, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    data = PromoCategoryUpdate(**body).model_dump(exclude_unset=True)
    if "source_field_id" in data:
        _check_source_field(db, data["source_field_id"], exclude_id=cat_id)
    for key, value in data.items():
        setattr(cat, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Поле уже используется другой категорией")
    return {"message": "Категория обновлена", "id": cat_id}


@router.delete("/promo-categories/{cat_id}")
def delete_promo_category(cat_id: str, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Удаляет ТОЛЬКО настройки сайта: строку категории и её связи с товарами (каскад).
    Данные МойСклад (Product.attributes) и строка реестра не трогаются.

    Файл иконки остаётся в библиотеке (``promo.icon_library``): он мог стоять и у других
    разделов, а даже если нет — библиотека и есть место, где иконка ждёт следующего раздела.

    ⚠️ Удаление окончательно: обмен категорию НЕ восстановит (категории создаёт только админ).
    Вернуть можно вручную — поле остаётся в выпадающем списке, членство пересоберётся на
    ближайшем обмене, но slug сгенерируется заново → прежний URL раздела не восстановится.
    Чтобы временно убрать раздел с витрины, правильнее выключить (is_active=false).
    """
    cat = db.get(PromoCategory, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    db.delete(cat)   # product_promo_categories чистится каскадом (ondelete=CASCADE)
    db.commit()
    return {"message": "Категория удалена", "id": cat_id}


# ─── Библиотека своих иконок промо-разделов ────────────────────────
# Хранилище — ShopSettings['promo.icon_library'] (JSON-список имён файлов), как `brands`:
# новых таблиц и миграций не требует. Загруженная иконка живёт в библиотеке независимо от
# разделов, поэтому её можно поставить сразу нескольким и снять, ничего не потеряв.

def _load_icon_library(db: Session) -> list[str]:
    """Имена файлов своих иконок из настроек — новые сверху (порядок хранения)."""
    raw = _get_setting(db, promo_service.ICON_LIBRARY_SETTING_KEY)
    try:
        data = json.loads(raw) if raw else []
    except (ValueError, TypeError):
        return []
    if not isinstance(data, list):
        return []
    # is_image_filename смотрит только на расширение, поэтому отдельно требуем, чтобы имя
    # совпадало со своим basename: путь в настройке — не то, что стоит нести до delete_image.
    return [
        n for n in data
        if isinstance(n, str) and n == os.path.basename(n) and media_storage.is_image_filename(n)
    ]


def _icon_usage(db: Session) -> dict[str, list[str]]:
    """Какими разделами занята каждая иконка: имя файла → названия разделов."""
    usage: dict[str, list[str]] = {}
    for icon, title in db.execute(select(PromoCategory.icon, PromoCategory.title)):
        file_name = promo_service.icon_file_name(icon)
        if file_name:
            usage.setdefault(file_name, []).append(title)
    return usage


@router.get("/promo-icons")
def list_promo_icons(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Библиотека своих иконок: имя файла + кем занята.

    Список — это настройка ПЛЮС файлы, которые уже стоят у разделов: иконку могли загрузить
    до появления библиотеки (или настройку почистить руками), и тогда она не должна пропасть
    из галереи. Порядок настройки сохраняем, найденное добавляем в конец.

    Returns:
        ``{"items": [{"name": str, "used_by": [str, ...]}]}`` — ``used_by`` пуст, если
        иконку не выбрал ни один раздел (только такие можно удалить).
    """
    usage = _icon_usage(db)
    names = _load_icon_library(db)
    names += sorted(n for n in usage if n not in names)
    return {"items": [{"name": n, "used_by": usage.get(n, [])} for n in names]}


@router.post("/promo-icons")
async def upload_promo_icon(
    file: UploadFile = File(...), db: Session = Depends(get_db), _=Depends(_get_current_admin),
):
    """Кладёт свою иконку в медиа-хранилище и добавляет её в библиотеку."""
    data = await file.read()
    try:
        name = media_storage.save_upload(file.filename or "icon.png", data)
    except ValueError:
        raise HTTPException(status_code=400, detail="Можно загружать только изображения")
    library = _load_icon_library(db)
    if name not in library:
        library.insert(0, name)   # свежая иконка — первой, её сейчас и будут выбирать
    _set_setting(db, promo_service.ICON_LIBRARY_SETTING_KEY, json.dumps(library, ensure_ascii=False))
    db.commit()
    return {"name": name}


@router.delete("/promo-icons/{name}")
def delete_promo_icon(name: str, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Убирает свою иконку из библиотеки и с диска.

    Занятую иконку не удаляем — иначе у раздела молча погас бы бейдж. Встроенные иконки
    сюда не попадают в принципе: за ними нет файла, их нет в библиотеке.
    """
    library = _load_icon_library(db)
    if name not in library:
        raise HTTPException(status_code=404, detail="Иконки нет в библиотеке")
    used_by = _icon_usage(db).get(name, [])
    if used_by:
        raise HTTPException(
            status_code=409,
            detail=f"Иконка занята разделами: {', '.join(used_by)}. Сначала смените её там.",
        )
    _set_setting(
        db, promo_service.ICON_LIBRARY_SETTING_KEY,
        json.dumps([n for n in library if n != name], ensure_ascii=False),
    )
    db.commit()
    media_storage.delete_image(name)
    return {"message": "Иконка удалена", "name": name}


# ─── Категории: иконка как свойство самой категории (вкладка «Категории») ──────────
# Иконка живёт в Category.icon (media_storage), одна на категорию, используется везде, где
# показывается категория. Обмен эту колонку не трогает. Список — ВСЕ синхронизированные
# категории (включая пустые, которых нет на витрине), к API МойСклад не ходим.

@router.get("/categories")
def list_categories_admin(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Все категории из БД (имя + иконка) для управления иконками. Порядок — по id стабильный;
    сортировку/поиск делает фронт (чистит имя тем же правилом, что и витрина)."""
    cats = db.scalars(select(Category).order_by(Category.name)).all()
    return [{"id": c.id, "name": c.name, "icon": c.icon} for c in cats]


@router.post("/categories/{category_id}/icon")
async def upload_category_icon(
    category_id: str, file: UploadFile = File(...),
    db: Session = Depends(get_db), _=Depends(_get_current_admin),
):
    """Загружает/заменяет иконку категории. Старый файл при замене удаляется (без сирот на диске)."""
    cat = db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    data = await file.read()
    try:
        name = media_storage.save_upload(file.filename or "icon.png", data)
    except ValueError:
        raise HTTPException(status_code=400, detail="Можно загружать только изображения")
    old = cat.icon
    cat.icon = name
    db.commit()
    if old and old != name and old.startswith("upload_"):
        media_storage.delete_image(old)
    return {"name": name, "url": f"/api/v1/admin/media/{name}"}


@router.delete("/categories/{category_id}/icon")
def delete_category_icon(category_id: str, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Убирает иконку категории (файл с диска + Category.icon=NULL). Категория остаётся без иконки."""
    cat = db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    old = cat.icon
    cat.icon = None
    db.commit()
    if old and old.startswith("upload_"):
        media_storage.delete_image(old)
    return {"message": "Иконка удалена", "id": category_id}


# ─── Топ категорий главной (8 слотов: ТОЛЬКО выбор категории + порядок) ──────────
# Хранилище — ShopSettings['top_categories'] (JSON-список category_id), как banners/brands: без
# новых таблиц. Иконка НЕ хранится здесь — берётся из Category.icon по category_id (см. выше).
# Список категорий — GET /admin/categories (данные из БД). См. services/top_categories.py.

@router.get("/top-categories")
def get_top_categories(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Ровно 8 слотов (category_id; недостающие — пустая строка) для формы админки."""
    return {"slots": top_categories.load_padded(db)}


@router.post("/top-categories")
def save_top_categories(body: dict, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    """Сохраняет порядок категорий (только category_id). Изменения сразу видит витрина."""
    slots = body.get("slots")
    if not isinstance(slots, list):
        raise HTTPException(status_code=400, detail="Ожидался список слотов")
    top_categories.save(db, slots)
    db.commit()
    return {"message": "Топ категорий сохранён"}

"""Admin panel API."""

import bcrypt
import hmac
import jwt
import os
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, select

from app.core.config import settings
from app.db.session import get_db
from app.db.models.admin import AdminUser, ShopSettings
from app.db.models.product import Product, Category, SyncLog
from app.db.models.order import Order, OrderItem
from app.db.models.user import User as Customer
from app.schemas.auth import UserOut
from app.services import media_storage
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
    return {
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
        "delivery_info",
        # обмен с МойСклад + личные идентификаторы получателя (id ВК, email)
        "exchange_login", "exchange_password",
        "vk_peer_id", "notify_email",
        # единый контрагент для гостевых заказов (внешний код из МойСклад)
        "guest_moysklad_ext_code",
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
                "customer_name": o.customer_name, "customer_phone": o.customer_phone,
                "user_id": o.user_id, "is_guest": o.user_id is None,
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

    if avail == "yes":
        stmt = stmt.where(Product.available == True)
    elif avail == "no":
        stmt = stmt.where(Product.available == False)

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
        # Тема
        "theme_primary":      _get_setting(db, "theme_primary"),
        # Баннеры слайдера (в каталоге): включён ли показ + JSON-массив (по умолчанию выкл.)
        "banners_enabled":    _get_setting(db, "banners_enabled", "0") == "1",
        "home_banners":       _get_setting(db, "home_banners"),
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


# ─── Покупатели (личные кабинеты) ──────────────────────────────────

# Допустимый диапазон персональной корректировки цены: −30%…+9% (по умолчанию +5%).
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

"""Авторизация покупателя: регистрация, вход, выход, профиль.

Сделано по образцу админ-авторизации (``admin.py``): bcrypt + JWT в httpOnly-куке
(``customer_token``), недоступной JS — защита от XSS. Отдельно от админских токенов.
"""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import rate_limit, client_ip
from app.db.session import get_db
from app.db.models.user import User
from app.db.models.order import Order
from app.schemas.auth import (
    RegisterIn, LoginIn, UserOut, ChangePasswordIn,
    ForgotPasswordIn, ResetPasswordIn,
    ChangeEmailIn, ConfirmEmailChangeIn, EmailCheckIn, EmailSuggestionOut,
)
from app.schemas.order import OrderOut
from app.services.email_typos import suggest_email_fix

router = APIRouter(prefix="/auth", tags=["Auth"])

COOKIE_NAME = "customer_token"
COOKIE_MAX_AGE = 30 * 24 * 3600  # 30 дней, как и срок жизни JWT
RESET_TOKEN_TTL = 3600           # ссылка сброса пароля живёт 1 час
# Ссылка подтверждения нового email живёт дольше сброса пароля: письмо часто читают
# с другого устройства и не сразу, а риск ниже — ссылка ведёт лишь на смену адреса
# и работает, только пока заявка висит в ``pending_email``.
EMAIL_CHANGE_TOKEN_TTL = 24 * 3600
EMAIL_TAKEN_MSG = "Этот email уже занят другим аккаунтом. Укажите другой адрес."


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "typ": "customer",
        "exp": datetime.now(timezone.utc) + timedelta(seconds=COOKIE_MAX_AGE),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def _fingerprint(value: str) -> str:
    """Короткий отпечаток строки — «привязка» токена из письма к текущему состоянию аккаунта."""
    return hashlib.sha256(value.encode()).hexdigest()[:16]


def _pw_fingerprint(password_hash: str) -> str:
    """Короткий отпечаток текущего хэша пароля — «привязка» токена сброса к паролю.

    Кладём его в токен; при сбросе сверяем с актуальным. После смены пароля отпечаток
    меняется → старая ссылка становится недействительной (одноразовость без таблицы в БД)."""
    return _fingerprint(password_hash)


def _create_reset_token(user: User) -> str:
    payload = {
        "sub": user.id,
        "typ": "pwreset",
        "pv": _pw_fingerprint(user.password_hash),
        "exp": datetime.now(timezone.utc) + timedelta(seconds=RESET_TOKEN_TTL),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def _user_from_reset_token(token: str, db: Session) -> User | None:
    """Возвращает пользователя по валидному токену сброса (тип, срок, отпечаток пароля)."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None
    if payload.get("typ") != "pwreset":
        return None
    user = db.scalar(select(User).where(User.id == payload.get("sub")))
    if not user:
        return None
    # Отпечаток не совпал → пароль уже меняли этой (или другой) ссылкой → токен недействителен
    if payload.get("pv") != _pw_fingerprint(user.password_hash):
        return None
    return user


def _create_email_change_token(user: User) -> str:
    """Токен ссылки подтверждения нового email (уходит письмом на ЗАЯВЛЕННЫЙ адрес).

    Несёт сам новый адрес и отпечаток текущего email. Одноразовость даёт связка с
    ``pending_email``: после подтверждения (или отмены) заявки в БД её нет — токен мёртв.
    Отпечаток дополнительно гасит старые ссылки, если email успел смениться иначе.
    """
    payload = {
        "sub": user.id,
        "typ": "emailchange",
        "new": user.pending_email,
        "cur": _fingerprint(user.email),
        "exp": datetime.now(timezone.utc) + timedelta(seconds=EMAIL_CHANGE_TOKEN_TTL),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def _user_from_email_change_token(token: str, db: Session) -> tuple[User, str] | None:
    """Пользователь и новый адрес по валидному токену смены email, иначе ``None``.

    Проверяем всё: тип и срок токена, существование покупателя, неизменность текущего
    email (отпечаток) и то, что заявка ещё висит — ``token["new"] == user.pending_email``.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None
    if payload.get("typ") != "emailchange":
        return None
    user = db.scalar(select(User).where(User.id == payload.get("sub")))
    if not user or not user.pending_email:
        return None
    if payload.get("cur") != _fingerprint(user.email):
        return None
    new_email = payload.get("new")
    # Заявку могли отменить или заменить другой — тогда ссылка из старого письма мертва
    if not new_email or new_email != user.pending_email:
        return None
    return user, new_email


def _clear_pending_email(user: User) -> None:
    """Снимает заявку на смену email (после подтверждения, отмены или конфликта)."""
    user.pending_email = None
    user.pending_email_at = None


def _extract_token(request: Request) -> str | None:
    token = request.cookies.get(COOKIE_NAME)
    if token:
        return token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


def _user_from_token(token: str, db: Session) -> User | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None
    if payload.get("typ") != "customer":
        return None
    return db.scalar(select(User).where(User.id == payload.get("sub")))


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Зависимость: текущий покупатель по куке. 401, если не авторизован."""
    token = _extract_token(request)
    user = _user_from_token(token, db) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Не авторизовано")
    return user


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    """Зависимость: покупатель или ``None`` (для персональных цен без требования входа)."""
    token = _extract_token(request)
    return _user_from_token(token, db) if token else None


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,        # недоступно JS — защита от XSS
        samesite="lax",
        secure=settings.COOKIE_SECURE,  # True на HTTPS-проде (COOKIE_SECURE в .env.prod)
        max_age=COOKIE_MAX_AGE,
        path="/",
    )


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    """Регистрирует покупателя и сразу авторизует (без подтверждения email).

    Raises:
        HTTPException: 409, если email уже зарегистрирован; 429 при частых попытках.
    """
    rate_limit(f"rl:register:{client_ip(request)}", limit=5, window_sec=3600)
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже зарегистрирован")
    # Телефон нормализован схемой к +7XXXXXXXXXX — проверяем уникальность (один номер = один аккаунт)
    if db.scalar(select(User).where(User.phone == body.phone)):
        raise HTTPException(status_code=409, detail="Пользователь с таким телефоном уже зарегистрирован")
    # Опечатку в домене (gmial.com) НЕ проверяем на бэкенде как ошибку: подсказку показывает
    # форма (POST /auth/check-email), а осознанный выбор адреса остаётся за покупателем.

    user = User(
        email=body.email,
        phone=body.phone,
        customer_type=body.customer_type,
        customer_name=body.customer_name,
        inn=body.inn,
        password_hash=_hash_password(body.password),
        consent_at=_utcnow_naive(),
        # Новый аккаунт ждёт активации сотрудником ТД; генерируем стабильный «Внешний код»
        # контрагента для МойСклад (уходит в заказе как <Ид> → «Внешний код»).
        is_active=False,
        moysklad_ext_code=uuid.uuid4().hex[:16],
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Гонка двух одновременных регистраций: проверки выше уже прошли, а вставку отбил
        # unique-индекс (ix_users_email / ix_users_phone). Отдаём понятный 409, а не 500.
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Пользователь с таким email или телефоном уже зарегистрирован")
    db.refresh(user)

    # Уведомляем владельца о новой регистрации (ВК/Email). Сбой очереди не должен ломать регистрацию.
    try:
        from app.tasks.notify import notify_new_registration
        notify_new_registration.delay(user.id)
    except Exception:
        pass

    _set_cookie(response, _create_token(user.id))
    return user


@router.post("/forgot")
def forgot_password(body: ForgotPasswordIn, request: Request, db: Session = Depends(get_db)):
    """Запрос восстановления пароля: если email есть — шлём письмо со ссылкой сброса.

    Ответ всегда одинаковый (``{"ok": true}``) — не раскрываем, зарегистрирован ли email.
    """
    rate_limit(f"rl:forgot:{client_ip(request)}", limit=5, window_sec=3600)
    user = db.scalar(select(User).where(User.email == body.email))
    if user:
        token = _create_reset_token(user)
        try:
            from app.tasks.notify import send_password_reset
            send_password_reset.delay(user.id, token)
        except Exception:
            pass
    return {"ok": True}


@router.post("/reset", response_model=UserOut)
def reset_password(body: ResetPasswordIn, request: Request, response: Response, db: Session = Depends(get_db)):
    """Устанавливает новый пароль по токену из письма и сразу авторизует.

    Raises:
        HTTPException: 400, если ссылка недействительна/устарела/уже использована.
    """
    rate_limit(f"rl:reset:{client_ip(request)}", limit=10, window_sec=3600)
    user = _user_from_reset_token(body.token, db)
    if not user:
        raise HTTPException(status_code=400, detail="Ссылка недействительна или устарела. Запросите сброс заново.")
    user.password_hash = _hash_password(body.new_password)
    db.commit()
    db.refresh(user)
    _set_cookie(response, _create_token(user.id))   # авто-вход после сброса
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    """Вход покупателя; ставит JWT в httpOnly-куку.

    Raises:
        HTTPException: 401, если email/пароль не совпали; 429 при частых попытках.
    """
    # Защита от перебора паролей: не более 10 попыток за 5 минут с одного IP.
    rate_limit(f"rl:login:{client_ip(request)}", limit=10, window_sec=300)
    user = db.scalar(select(User).where(User.email == body.email))
    if not user or not _verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    _set_cookie(response, _create_token(user.id))
    return user


@router.post("/change-password")
def change_password(
    body: ChangePasswordIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Смена пароля покупателем: сверяем текущий, ставим новый (надёжность проверена схемой).

    Raises:
        HTTPException: 400, если текущий пароль неверный.
    """
    if not _verify_password(body.current_password, current.password_hash):
        raise HTTPException(status_code=400, detail="Текущий пароль указан неверно")
    current.password_hash = _hash_password(body.new_password)
    db.commit()
    return {"message": "Пароль изменён"}


@router.post("/check-email", response_model=EmailSuggestionOut)
def check_email(body: EmailCheckIn, request: Request):
    """Подсказка об опечатке в домене адреса: ``{"suggestion": "ivan@gmail.com"}`` или ``null``.

    Ничего не блокирует и в БД не ходит — занятость адреса тут НЕ проверяется намеренно
    (иначе публичный эндпоинт позволил бы перебирать зарегистрированные адреса). Нужен
    формам регистрации и смены email, чтобы словарь опечаток жил в одном месте — на бэкенде.
    """
    rate_limit(f"rl:checkemail:{client_ip(request)}", limit=120, window_sec=3600)
    return EmailSuggestionOut(suggestion=suggest_email_fix(body.email))


@router.post("/change-email")
def request_email_change(
    body: ChangeEmailIn,
    request: Request,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Заявка на смену email: проверяем пароль и занятость, шлём письмо на НОВЫЙ адрес.

    Сам ``email`` (он же логин) здесь не меняется — до перехода по ссылке из письма вход
    остаётся по старому адресу. Новый лежит в ``pending_email``.

    Raises:
        HTTPException: 400 — неверный текущий пароль или адрес совпадает с нынешним;
            409 — адрес уже занят; 429 при частых попытках.
    """
    # Два лимита: по IP (перебор) и по аккаунту — чтобы форму нельзя было превратить
    # в рассыльщик писем на чужие адреса.
    rate_limit(f"rl:chemail:{client_ip(request)}", limit=10, window_sec=3600)
    rate_limit(f"rl:chemail:user:{current.id}", limit=5, window_sec=3600)

    if not _verify_password(body.current_password, current.password_hash):
        raise HTTPException(status_code=400, detail="Текущий пароль указан неверно")
    if body.new_email == current.email:
        raise HTTPException(status_code=400, detail="Это ваш текущий email — введите новый адрес")
    if db.scalar(select(User).where(User.email == body.new_email)):
        raise HTTPException(status_code=409, detail=EMAIL_TAKEN_MSG)

    # Новая заявка вытесняет предыдущую: ссылки из прошлых писем перестают работать
    # (в токене лежит адрес, а он больше не совпадает с pending_email).
    current.pending_email = body.new_email
    current.pending_email_at = _utcnow_naive()
    db.commit()
    db.refresh(current)

    token = _create_email_change_token(current)
    # Сбой очереди не должен ронять заявку — как и в регистрации/восстановлении пароля.
    try:
        from app.tasks.notify import send_email_change_confirm
        send_email_change_confirm.delay(current.id, token)
    except Exception:
        pass

    return {
        "message": f"Письмо с подтверждением отправлено на {current.pending_email}. "
                   f"Адрес изменится только после перехода по ссылке из письма.",
        "pending_email": current.pending_email,
    }


@router.post("/change-email/confirm", response_model=UserOut)
def confirm_email_change(
    body: ConfirmEmailChangeIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Подтверждение смены email по ссылке из письма. Меняет логин и обновляет куку.

    Авторизацию даёт сам токен: письмо часто открывают в другом браузере (почта на телефоне),
    поэтому кука здесь не требуется.

    Raises:
        HTTPException: 400 — ссылка недействительна/устарела/уже использована;
            409 — адрес успел занять кто-то другой; 429 при частых попытках.
    """
    rate_limit(f"rl:chemailconf:{client_ip(request)}", limit=20, window_sec=3600)
    found = _user_from_email_change_token(body.token, db)
    if not found:
        raise HTTPException(
            status_code=400,
            detail="Ссылка недействительна или устарела. Запросите смену email заново.")
    user, new_email = found

    # Между заявкой и подтверждением адрес мог занять другой покупатель — проверяем ещё раз
    # и снимаем заявку, чтобы ЛК не показывал вечное «ожидает подтверждения».
    if db.scalar(select(User).where(User.email == new_email, User.id != user.id)):
        _clear_pending_email(user)
        db.commit()
        raise HTTPException(status_code=409, detail=EMAIL_TAKEN_MSG)

    old_email = user.email
    user.email = new_email
    _clear_pending_email(user)
    try:
        db.commit()
    except IntegrityError:
        # Тот же конфликт, но выигранный гонкой в момент коммита — ловим unique-индекс,
        # чтобы покупатель увидел понятный 409, а не 500.
        db.rollback()
        raise HTTPException(status_code=409, detail=EMAIL_TAKEN_MSG)
    db.refresh(user)

    # Письмо на СТАРЫЙ адрес — сигнал владельцу аккаунта, если смену затеял не он.
    try:
        from app.tasks.notify import notify_email_changed
        notify_email_changed.delay(user.id, old_email)
    except Exception:
        pass

    _set_cookie(response, _create_token(user.id))   # ссылку могли открыть в другом браузере
    return user


@router.post("/change-email/cancel", response_model=UserOut)
def cancel_email_change(
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Отмена заявки на смену email — ссылка из отправленного письма перестаёт работать."""
    _clear_pending_email(current)
    db.commit()
    db.refresh(current)
    return current


@router.post("/logout")
def logout(response: Response):
    """Выход — сбрасывает куку."""
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"message": "Вышли"}


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    """Профиль текущего покупателя (для фронта — проверка авторизации)."""
    return current


@router.get("/orders", response_model=list[OrderOut])
def my_orders(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """История заказов текущего покупателя — новые сверху.

    Заказы привязываются к покупателю через ``Order.user_id`` при оформлении
    из кабинета (см. ``orders.create_order``). Гостевые заказы сюда не попадают.
    """
    return db.scalars(
        select(Order).where(Order.user_id == current.id).order_by(Order.created_at.desc())
    ).all()

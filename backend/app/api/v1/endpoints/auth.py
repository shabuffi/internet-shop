"""Авторизация покупателя: регистрация, вход, выход, профиль.

Сделано по образцу админ-авторизации (``admin.py``): bcrypt + JWT в httpOnly-куке
(``customer_token``), недоступной JS — защита от XSS. Отдельно от админских токенов.
"""

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import rate_limit, client_ip
from app.db.session import get_db
from app.db.models.user import User
from app.db.models.order import Order
from app.schemas.auth import RegisterIn, LoginIn, UserOut, ChangePasswordIn
from app.schemas.order import OrderOut

router = APIRouter(prefix="/auth", tags=["Auth"])

COOKIE_NAME = "customer_token"
COOKIE_MAX_AGE = 30 * 24 * 3600  # 30 дней, как и срок жизни JWT


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
    db.commit()
    db.refresh(user)

    # Уведомляем владельца о новой регистрации (ВК/Email). Сбой очереди не должен ломать регистрацию.
    try:
        from app.tasks.notify import notify_new_registration
        notify_new_registration.delay(user.id)
    except Exception:
        pass

    _set_cookie(response, _create_token(user.id))
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

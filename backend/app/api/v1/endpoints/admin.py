"""Admin panel API."""

import bcrypt
import jwt
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.config import settings
from app.db.session import get_db
from app.db.models.admin import AdminUser, ShopSettings
from app.db.models.product import Product, SyncLog
from app.db.models.order import Order

router = APIRouter(prefix="/admin", tags=["Admin"])
bearer = HTTPBearer()

# ─── Auth helpers ──────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def _create_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

def _get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> AdminUser:
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=["HS256"])
        username = payload.get("sub")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Неверный токен")

    user = db.scalar(select(AdminUser).where(AdminUser.username == username))
    if not user:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    return user


# ─── Auth endpoints ────────────────────────────────────────────────

@router.post("/login")
def login(body: dict, db: Session = Depends(get_db)):
    username = body.get("username", "")
    password = body.get("password", "")

    user = db.scalar(select(AdminUser).where(AdminUser.username == username))
    if not user or not _verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    return {"access_token": _create_token(username), "token_type": "bearer"}


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
    row = db.get(ShopSettings, key)
    return row.value if row else default

def _set_setting(db: Session, key: str, value: str):
    row = db.get(ShopSettings, key)
    if row:
        row.value = value
    else:
        db.add(ShopSettings(key=key, value=value))


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    return {
        "moysklad_login":     _get_setting(db, "moysklad_login"),
        "moysklad_password":  "***" if _get_setting(db, "moysklad_password") else "",
        "sync_interval":      _get_setting(db, "sync_interval", "300"),
        "shop_name":          _get_setting(db, "shop_name", "Магазин"),
    }


@router.post("/settings")
def save_settings(body: dict, db: Session = Depends(get_db), _=Depends(_get_current_admin)):
    allowed = {"moysklad_login", "moysklad_password", "sync_interval", "shop_name"}
    for key, value in body.items():
        if key in allowed and value != "***":
            _set_setting(db, key, str(value))
    db.commit()
    return {"message": "Настройки сохранены"}


# ─── Dashboard data ────────────────────────────────────────────────

@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
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


@router.get("/products")
def list_products_admin(
    page: int = 1,
    db: Session = Depends(get_db),
    _=Depends(_get_current_admin),
):
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


@router.get("/sync-logs")
def sync_logs(db: Session = Depends(get_db), _=Depends(_get_current_admin)):
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

"""Публичные юридические страницы (читает витрина). Без авторизации.

Редактирование — в админке (``admin.py`` → ``/admin/policy``).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.legal_content import get_privacy, get_info_pages

router = APIRouter(prefix="/legal", tags=["Legal"])


@router.get("/privacy")
def privacy(db: Session = Depends(get_db)):
    """Политика обработки ПД: тело, дата редакции, реквизиты оператора."""
    return get_privacy(db)


@router.get("/pages")
def info_pages(db: Session = Depends(get_db)):
    """Инфо-страницы «Оформление заказа»/«Оплата»: {slug: {title, body}} для витрины."""
    return get_info_pages(db)

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.rate_limit import rate_limit, client_ip
from app.db.session import get_db
from app.db.models.lead import Lead
from app.schemas.lead import LeadIn

router = APIRouter(prefix="/leads", tags=["Leads"])


@router.post("", status_code=201)
def create_lead(payload: LeadIn, request: Request, db: Session = Depends(get_db)):
    """Принимает заявку с сайта («Получить прайс»), сохраняет и уведомляет владельца.

    Уведомление (ВК/Email) уходит фоном — по той же схеме, что и о заказе.

    Args:
        payload: Данные заявки (имя, телефон, магазин, регион, комментарий).
        db: Сессия БД.

    Returns:
        ``{"ok": True, "id": <id>}``.
    """
    # Защита от спама заявками: не более 10 отправок за 10 минут с одного IP.
    rate_limit(f"rl:lead:{client_ip(request)}", limit=10, window_sec=600)

    lead = Lead(
        name=payload.name,
        phone=payload.phone,
        shop_name=(payload.shop_name or "").strip() or None,
        region=(payload.region or "").strip() or None,
        comment=(payload.comment or "").strip() or None,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    from app.tasks.notify import notify_new_lead
    notify_new_lead.delay(lead.id)

    return {"ok": True, "id": lead.id}

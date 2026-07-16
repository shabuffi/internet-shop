from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.promo import PromoCategory
from app.schemas.promo import PromoCategoryPublic

router = APIRouter(prefix="/promo-categories", tags=["Promo"])


@router.get("", response_model=list[PromoCategoryPublic])
def list_promo_categories(db: Session = Depends(get_db)):
    """Активные промо-категории для витрины (меню, ленты главной, страницы разделов).

    Отсортированы по display_order. Технических полей (source_field) не отдаём.
    """
    return (
        db.query(PromoCategory)
        .filter(PromoCategory.is_active == True)
        .order_by(PromoCategory.display_order.asc(), PromoCategory.title.asc())
        .all()
    )

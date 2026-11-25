from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import DeliveryZone
from app.schemas.delivery import DeliveryZoneResponse

router = APIRouter(prefix="/delivery-zones", tags=["Delivery"])


@router.get("", response_model=list[DeliveryZoneResponse])
def list_delivery_zones(db: Session = Depends(get_db)) -> list[DeliveryZone]:
    """Areas FieldBasket currently delivers to, with their fees."""
    return list(
        db.scalars(
            select(DeliveryZone)
            .where(DeliveryZone.is_active.is_(True))
            .order_by(DeliveryZone.sort_order, DeliveryZone.name)
        )
    )

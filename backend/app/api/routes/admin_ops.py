"""Admin: delivery areas and the money side of orders."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models import Checkout, DeliveryZone, Order, User
from app.schemas.delivery import DeliveryZoneCreate, DeliveryZoneResponse, DeliveryZoneUpdate
from app.schemas.order import OrderResponse

router = APIRouter(prefix="/admin", tags=["Admin - Operations"])


@router.get("/delivery-zones", response_model=list[DeliveryZoneResponse])
def admin_list_zones(
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> list[DeliveryZone]:
    return list(db.scalars(select(DeliveryZone).order_by(DeliveryZone.sort_order, DeliveryZone.name)))


def _save_zone(db: Session, zone: DeliveryZone) -> DeliveryZone:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A delivery area with that name already exists.",
        ) from None
    db.refresh(zone)
    return zone


@router.post("/delivery-zones", response_model=DeliveryZoneResponse, status_code=status.HTTP_201_CREATED)
def admin_create_zone(
    data: DeliveryZoneCreate,
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> DeliveryZone:
    zone = DeliveryZone(**data.model_dump())
    db.add(zone)
    return _save_zone(db, zone)


@router.patch("/delivery-zones/{zone_id}", response_model=DeliveryZoneResponse)
def admin_update_zone(
    zone_id: UUID,
    data: DeliveryZoneUpdate,
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> DeliveryZone:
    zone = db.get(DeliveryZone, zone_id)
    if zone is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery area not found.")
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is None and key != "description":
            continue
        setattr(zone, key, value)
    return _save_zone(db, zone)


@router.delete("/delivery-zones/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_zone(
    zone_id: UUID,
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> None:
    zone = db.get(DeliveryZone, zone_id)
    if zone is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery area not found.")
    # Past checkouts keep the area's name, so removing it is safe.
    db.delete(zone)
    db.commit()


AdminOrderFilter = Literal["all", "paid", "refund_pending", "refunded"]


@router.get("/orders", response_model=list[OrderResponse])
def admin_list_orders(
    payment_status: AdminOrderFilter = Query(default="all"),
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> list[Order]:
    query = (
        select(Order)
        .where(Order.payment_status.not_in(("awaiting", "failed")))
        .order_by(Order.created_at.desc(), Order.id.asc())
        .limit(300)
    )
    if payment_status != "all":
        query = query.where(Order.payment_status == payment_status)
    return list(db.scalars(query))


@router.patch("/orders/{order_id}/refund-complete", response_model=OrderResponse)
def admin_mark_refunded(
    order_id: UUID,
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> Order:
    """Record a refund an admin made by hand (e.g. in the Interswitch console)."""
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    if order.payment_status != "refund_pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This order has no refund waiting.")
    order.payment_status = "refunded"
    db.commit()
    db.refresh(order)
    return order


@router.get("/checkouts/{reference}")
def admin_get_checkout(
    reference: str,
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
) -> dict:
    checkout = db.scalar(select(Checkout).where(Checkout.reference == reference))
    if checkout is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checkout not found.")
    return {
        "reference": checkout.reference,
        "provider": checkout.provider,
        "status": checkout.status,
        "amount_total": str(checkout.amount_total),
        "delivery_fee": str(checkout.delivery_fee),
        "delivery_fee_refunded": checkout.delivery_fee_refunded,
        "provider_reference": checkout.provider_reference,
    }

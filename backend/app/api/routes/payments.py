import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.db.session import get_db
from app.models import Checkout, User
from app.schemas.order import PaymentStatusResponse
from app.services import checkout_flow, payments
from app.services.email import send_all

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.get("/providers")
def list_providers() -> list[dict[str, str]]:
    """Payment options shown at checkout (only those with keys set)."""
    return [{"id": p, "name": payments.PROVIDER_LABELS[p]} for p in payments.enabled_providers()]


def _status(checkout: Checkout) -> PaymentStatusResponse:
    return PaymentStatusResponse(
        reference=checkout.reference,
        provider=checkout.provider,
        status=checkout.status,
        items_total=checkout.items_total,
        delivery_fee=checkout.delivery_fee,
        amount_total=checkout.amount_total,
        delivery_zone_name=checkout.delivery_zone_name,
        order_count=len(checkout.orders),
        paid_at=checkout.paid_at,
    )


def _own_checkout(reference: str, user: User, db: Session) -> Checkout:
    checkout = db.scalar(select(Checkout).where(Checkout.reference == reference))
    if checkout is None or checkout.buyer_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found.")
    return checkout


@router.get("/{reference}", response_model=PaymentStatusResponse)
def get_payment(
    reference: str,
    current_user: User = Depends(require_role("buyer")),
    db: Session = Depends(get_db),
) -> PaymentStatusResponse:
    return _status(_own_checkout(reference, current_user, db))


@router.post("/{reference}/verify", response_model=PaymentStatusResponse)
def verify_payment(
    reference: str,
    background: BackgroundTasks,
    current_user: User = Depends(require_role("buyer")),
    db: Session = Depends(get_db),
) -> PaymentStatusResponse:
    """Called when the buyer returns from the payment page."""
    checkout = _own_checkout(reference, current_user, db)
    emails = checkout_flow.confirm_checkout(db, checkout)
    db.commit()
    db.refresh(checkout)
    if emails:
        background.add_task(send_all, emails)
    return _status(checkout)


@router.post("/paystack/webhook", include_in_schema=False)
async def paystack_webhook(request: Request, background: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    """Paystack tells us about payments, even if the buyer closed the tab.

    The signature proves the call came from Paystack; the payment itself
    is still confirmed by asking Paystack directly.
    """
    raw = await request.body()
    signature = request.headers.get("x-paystack-signature") or request.headers.get("paystack-signature")
    if not payments.paystack_signature_valid(raw, signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature.")
    try:
        event = json.loads(raw)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid body.") from None

    reference = (event.get("data") or {}).get("reference")
    if event.get("event") == "charge.success" and reference:
        checkout = db.scalar(select(Checkout).where(Checkout.reference == reference))
        if checkout is not None:
            emails = checkout_flow.confirm_checkout(db, checkout)
            db.commit()
            if emails:
                background.add_task(send_all, emails)
    return {"ok": True}

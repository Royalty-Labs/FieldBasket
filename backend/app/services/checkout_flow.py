"""What happens to a checkout and its orders as payment succeeds or fails."""

import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import Checkout, Order, Product, User
from app.services import messages, payments
from app.services.email import Email

logger = logging.getLogger(__name__)

CLOSED_ORDER_STATUSES = {"rejected", "cancelled"}


def as_utc(moment: datetime) -> datetime:
    """SQLite returns naive datetimes; treat them as the UTC they are."""
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _restore_stock(db: Session, order: Order) -> None:
    if order.product_id is None:
        return
    db.execute(
        update(Product)
        .where(Product.id == order.product_id)
        .values(quantity_available=Product.quantity_available + order.quantity, updated_at=func.now())
    )


def release_checkout(db: Session, checkout: Checkout, status: str) -> None:
    """An unpaid checkout ends: cancel its orders and give stock back."""
    checkout.status = status
    for order in checkout.orders:
        if order.payment_status == "awaiting":
            order.status = "cancelled"
            order.payment_status = "failed"
            _restore_stock(db, order)


def _paid_emails(checkout: Checkout) -> list[Email]:
    buyer: User = checkout.buyer
    emails = [
        messages.buyer_receipt(
            buyer.email,
            buyer.full_name,
            checkout.reference,
            [(o.product_name, o.quantity, o.unit, o.total_price, o.farm_name or "Farm") for o in checkout.orders],
            checkout.items_total,
            checkout.delivery_fee,
            checkout.amount_total,
            checkout.delivery_zone_name,
            checkout.delivery_address,
        )
    ]
    by_farmer: dict = {}
    for order in checkout.orders:
        by_farmer.setdefault(order.farmer_id, []).append(order)
    for farmer_orders in by_farmer.values():
        farmer = farmer_orders[0].farmer
        emails.append(
            messages.farmer_new_orders(
                farmer.email,
                farmer.full_name,
                [(o.product_name, o.quantity, o.unit, o.total_price) for o in farmer_orders],
                buyer.full_name,
                checkout.buyer_phone,
                checkout.delivery_zone_name,
                checkout.delivery_address,
                checkout.buyer_note,
            )
        )
    return emails


def confirm_checkout(db: Session, checkout: Checkout) -> list[Email]:
    """Ask the provider about a checkout and settle it. Safe to repeat.

    Returns the emails to send if this call is the one that settled it.
    The caller commits.
    """
    if checkout.status == "paid":
        return []

    try:
        result = payments.check_payment(checkout)
    except payments.PaymentError:
        logger.warning("Could not check payment %s", checkout.reference)
        return []

    now = datetime.now(timezone.utc)

    if checkout.status == "awaiting_payment":
        if result.status == "paid":
            checkout.status = "paid"
            checkout.paid_at = now
            checkout.provider_reference = result.provider_reference
            for order in checkout.orders:
                if order.payment_status == "awaiting":
                    order.payment_status = "paid"
            return _paid_emails(checkout)
        if result.status == "failed":
            release_checkout(db, checkout, "failed")
        elif as_utc(checkout.expires_at) <= now:
            release_checkout(db, checkout, "expired")
        return []

    # Paid after it had already expired or failed: the stock is gone, so
    # return the money.
    if result.status == "paid" and checkout.provider_reference is None:
        checkout.provider_reference = result.provider_reference or "late"
        refunded = payments.refund(checkout, checkout.amount_total)
        for order in checkout.orders:
            order.payment_status = "refunded" if refunded else "refund_pending"
        checkout.delivery_fee_refunded = True
        logger.warning("Late payment on %s; refund %s", checkout.reference, "sent" if refunded else "pending")
    return []


def expire_stale_checkouts(db: Session, limit: int = 20) -> list[Email]:
    """Settle unpaid checkouts past their deadline (checking each first)."""
    now = datetime.now(timezone.utc)
    stale = db.scalars(
        select(Checkout)
        .where(Checkout.status == "awaiting_payment", Checkout.expires_at <= now)
        .order_by(Checkout.expires_at)
        .limit(limit)
    ).all()
    emails: list[Email] = []
    for checkout in stale:
        emails += confirm_checkout(db, checkout)
        if checkout.status == "awaiting_payment":
            release_checkout(db, checkout, "expired")
    return emails


def refund_order(order: Order) -> tuple[bool, Decimal] | None:
    """Refund a paid order that a farm declined or the buyer cancelled.

    Includes the delivery fee once nothing in the checkout is still
    going ahead. Returns (refunded automatically, amount) or None if
    nothing was paid. The caller commits.
    """
    if order.payment_status != "paid" or order.checkout is None:
        return None
    checkout = order.checkout
    amount = order.total_price
    still_going = [
        o for o in checkout.orders if o.id != order.id and o.status not in CLOSED_ORDER_STATUSES
    ]
    if not still_going and not checkout.delivery_fee_refunded:
        amount += checkout.delivery_fee
        checkout.delivery_fee_refunded = True
    refunded = payments.refund(checkout, amount)
    order.payment_status = "refunded" if refunded else "refund_pending"
    return refunded, amount

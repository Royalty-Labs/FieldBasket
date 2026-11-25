import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.config import settings
from app.db.session import get_db
from app.models import Checkout, DeliveryZone, FarmerProfile, Order, Product, User
from app.schemas.order import (
    CheckoutRequest,
    CheckoutResponse,
    OrderCreate,
    OrderResponse,
    OrderStatusUpdate,
)

from app.services import checkout_flow, messages, payments
from app.services.email import Email, send_all

router = APIRouter(prefix="/orders", tags=["Orders"])


def get_order_or_404(
    order_id: UUID,
    db: Session,
) -> Order:
    order = db.get(Order, order_id)

    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found.",
        )

    return order


@router.post(
    "",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_order(
    data: OrderCreate,
    current_user: User = Depends(require_role("buyer")),
    db: Session = Depends(get_db),
) -> Order:
    if not settings.allow_unpaid_orders:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Orders are now placed and paid for from the basket.",
        )

    # Only products belonging to approved farmers can be ordered.
    product = db.scalar(
        select(Product)
        .join(
            FarmerProfile,
            FarmerProfile.user_id == Product.seller_id,
        )
        .where(
            Product.id == data.product_id,
            Product.is_available.is_(True),
            Product.quantity_available > Decimal("0"),
            FarmerProfile.verification_status == "approved",
        )
    )

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Available product not found.",
        )

    if data.quantity > product.quantity_available:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The requested quantity exceeds available stock.",
        )

    total_price = (
        product.price_per_unit * data.quantity
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    order = Order(
        buyer_id=current_user.id,
        farmer_id=product.seller_id,
        product_id=product.id,
        product_name=product.name,
        unit=product.unit,
        quantity=data.quantity,
        unit_price=product.price_per_unit,
        total_price=total_price,
        delivery_address=data.delivery_address,
        buyer_note=data.buyer_note,
        status="pending",
    )

    try:
        # Atomically reserve stock. The condition protects against
        # two buyers ordering the same remaining stock simultaneously.
        stock_update = db.execute(
            update(Product)
            .where(
                Product.id == product.id,
                Product.is_available.is_(True),
                Product.quantity_available >= data.quantity,
            )
            .values(
                quantity_available=(
                    Product.quantity_available - data.quantity
                ),
                updated_at=func.now(),
            )
        )

        if stock_update.rowcount != 1:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Stock has changed. Refresh the listing and try again.",
            )

        db.add(order)
        db.commit()
        db.refresh(order)

    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The order could not be created. Please try again.",
        ) from None

    return order


def _format_quantity(value: Decimal) -> str:
    return f"{value.normalize():f}"


def _new_reference() -> str:
    return "FB-" + secrets.token_hex(6).upper()


@router.post(
    "/checkout",
    response_model=CheckoutResponse,
    status_code=status.HTTP_201_CREATED,
)
def checkout(
    data: CheckoutRequest,
    current_user: User = Depends(require_role("buyer")),
    db: Session = Depends(get_db),
) -> CheckoutResponse:
    """Reserve a whole basket and start paying for it, all or nothing.

    One order is made per item, but farms only see them once the
    payment is confirmed. Unpaid baskets release their stock when the
    checkout expires.
    """
    if data.provider not in payments.enabled_providers():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That payment option isn't available right now.",
        )

    zone = db.get(DeliveryZone, data.delivery_zone_id)
    if zone is None or not zone.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="We don't deliver to that area yet. Choose another delivery area.",
        )

    product_ids = [item.product_id for item in data.items]

    products = {
        product.id: product
        for product in db.scalars(
            select(Product)
            .join(FarmerProfile, FarmerProfile.user_id == Product.seller_id)
            .where(
                Product.id.in_(product_ids),
                Product.is_available.is_(True),
                Product.quantity_available > Decimal("0"),
                FarmerProfile.verification_status == "approved",
            )
        )
    }

    unavailable = [pid for pid in product_ids if pid not in products]
    if unavailable:
        names = db.scalars(
            select(Product.name).where(Product.id.in_(unavailable))
        ).all()
        listed = ", ".join(names) if names else "Some items"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{listed} {'is' if len(names) == 1 else 'are'} no longer "
                "available. Remove it from your basket and try again."
            ),
        )

    orders: list[Order] = []
    now = datetime.now(timezone.utc)

    try:
        for item in data.items:
            product = products[item.product_id]

            if item.quantity > product.quantity_available:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Only {_format_quantity(product.quantity_available)} "
                        f"{product.unit} of {product.name} left. "
                        "Lower the quantity and try again."
                    ),
                )

            # Reserve stock with a guarded update, as for single orders.
            reserved = db.execute(
                update(Product)
                .where(
                    Product.id == product.id,
                    Product.is_available.is_(True),
                    Product.quantity_available >= item.quantity,
                )
                .values(
                    quantity_available=Product.quantity_available - item.quantity,
                    updated_at=func.now(),
                )
            )
            if reserved.rowcount != 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"The stock of {product.name} just changed. "
                        "Check your basket and try again."
                    ),
                )

            orders.append(
                Order(
                    buyer_id=current_user.id,
                    farmer_id=product.seller_id,
                    product_id=product.id,
                    product_name=product.name,
                    unit=product.unit,
                    quantity=item.quantity,
                    unit_price=product.price_per_unit,
                    total_price=(product.price_per_unit * item.quantity).quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    ),
                    delivery_address=data.delivery_address,
                    buyer_note=data.buyer_note,
                    buyer_phone=data.buyer_phone,
                    status="pending",
                    payment_status="awaiting",
                )
            )

        items_total = sum((order.total_price for order in orders), Decimal("0"))
        record = Checkout(
            reference=_new_reference(),
            buyer_id=current_user.id,
            provider=data.provider,
            status="awaiting_payment",
            items_total=items_total,
            delivery_fee=zone.fee,
            amount_total=items_total + zone.fee,
            delivery_zone_id=zone.id,
            delivery_zone_name=zone.name,
            delivery_address=data.delivery_address,
            buyer_phone=data.buyer_phone,
            buyer_note=data.buyer_note,
            expires_at=now + timedelta(minutes=settings.checkout_expiry_minutes),
            orders=orders,
        )
        db.add(record)
        db.flush()

        try:
            start = payments.start_payment(record, current_user.email, current_user.full_name)
        except payments.PaymentError as error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"{error} Nothing was charged. Please try again.",
            ) from None

        record.payment_url = start.redirect_url or start.form_action
        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Your basket could not be ordered. Please try again.",
        ) from None

    return CheckoutResponse(
        reference=record.reference,
        provider=record.provider,
        amount_total=record.amount_total,
        redirect_url=start.redirect_url,
        form_action=start.form_action,
        form_fields=start.form_fields,
    )


@router.get(
    "/mine",
    response_model=list[OrderResponse],
)
def list_my_orders(
    background: BackgroundTasks,
    current_user: User = Depends(require_role("buyer")),
    db: Session = Depends(get_db),
) -> list[Order]:
    emails = checkout_flow.expire_stale_checkouts(db)
    db.commit()
    if emails:
        background.add_task(send_all, emails)

    query = (
        select(Order)
        .where(
            Order.buyer_id == current_user.id,
            Order.payment_status != "failed",
        )
        .order_by(Order.created_at.desc(), Order.id.asc())
    )

    return list(db.scalars(query).all())


@router.get(
    "/farmer",
    response_model=list[OrderResponse],
)
def list_farmer_orders(
    current_user: User = Depends(require_role("farmer")),
    db: Session = Depends(get_db),
) -> list[Order]:
    query = (
        select(Order)
        .outerjoin(Checkout, Checkout.id == Order.checkout_id)
        .where(
            Order.farmer_id == current_user.id,
            # Paid in time, or placed before online payment.
            (Order.checkout_id.is_(None)) | (Checkout.status == "paid"),
        )
        .order_by(Order.created_at.desc(), Order.id.asc())
    )

    return list(db.scalars(query).all())


@router.patch(
    "/{order_id}/status",
    response_model=OrderResponse,
)
def update_order_status(
    order_id: UUID,
    data: OrderStatusUpdate,
    background: BackgroundTasks,
    current_user: User = Depends(require_role("buyer", "farmer")),
    db: Session = Depends(get_db),
) -> Order:
    order = get_order_or_404(order_id, db)

    # Define who may act and which transitions are allowed.
    if current_user.role == "buyer":
        if order.buyer_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found.",
            )

        allowed_transitions = {
            "pending": {"cancelled"},
            "ready_for_fulfillment": {"completed"},
        }

    else:
        if order.farmer_id != current_user.id or not order.visible_to_farmer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found.",
            )

        allowed_transitions = {
            "pending": {"accepted", "rejected"},
            "accepted": {"ready_for_fulfillment"},
        }

    if order.payment_status == "awaiting":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This order is waiting for payment. It will be cancelled automatically if it isn't paid.",
        )

    if data.status not in allowed_transitions.get(order.status, set()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot change order status from "
                f"'{order.status}' to '{data.status}'."
            ),
        )

    previous_status = order.status

    try:
        # Only one request can successfully move an order from its
        # previous status. This prevents duplicate stock restoration.
        status_update = db.execute(
            update(Order)
            .where(
                Order.id == order.id,
                Order.status == previous_status,
            )
            .values(
                status=data.status,
                rejection_reason=(
                    data.rejection_reason
                    if data.status == "rejected"
                    else None
                ),
                updated_at=func.now(),
            )
            .execution_options(synchronize_session=False)
        )

        if status_update.rowcount != 1:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The order has changed. Refresh and try again.",
            )

        # Rejected or cancelled pending orders release reserved stock.
        if (
            previous_status == "pending"
            and data.status in {"rejected", "cancelled"}
            and order.product_id is not None
        ):
            db.execute(
                update(Product)
                .where(Product.id == order.product_id)
                .values(
                    quantity_available=(
                        Product.quantity_available + order.quantity
                    ),
                    updated_at=func.now(),
                )
            )

        db.commit()
        db.refresh(order)

    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The order status could not be updated.",
        ) from None

    # Money back for paid orders that won't go ahead.
    refund = None
    if data.status in {"rejected", "cancelled"}:
        refund = checkout_flow.refund_order(order)
        if refund is not None:
            db.commit()
            db.refresh(order)

    background.add_task(send_all, _status_emails(order, data.status, refund))
    return order


def _status_emails(order: Order, new_status: str, refund: tuple[bool, Decimal] | None) -> list:
    amount = f"{_format_quantity(order.quantity)} {order.unit}"
    farm = order.farm_name or "The farm"
    note = messages.refund_note(*refund) if refund else None
    if new_status in {"accepted", "ready_for_fulfillment", "rejected"}:
        return [
            messages.buyer_order_update(
                order.buyer.email, order.buyer.full_name, order.product_name, amount, farm,
                new_status, order.rejection_reason, note,
            )
        ]
    emails = [
        messages.farmer_order_closed(
            order.farmer.email, order.farmer.full_name, order.product_name, amount,
            order.buyer.full_name, new_status,
        )
    ]
    if new_status == "cancelled" and note:
        emails.append(
            Email(
                to=order.buyer.email,
                subject=f"Your order for {order.product_name} was cancelled",
                lines=[f"Hello {order.buyer.full_name},", f"You cancelled your order for {order.product_name} ({amount}).", note],
            )
        )
    return emails

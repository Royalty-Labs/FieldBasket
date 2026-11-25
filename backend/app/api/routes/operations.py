"""Business settings, the admin dashboard, delivery dispatch and farm payouts."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.config import settings
from app.db.session import get_db
from app.models import Checkout, DeliveryZone, FarmerProfile, Order, Payout, Product, User
from app.schemas.farmer import FarmerProfileResponse
from app.schemas.order import OrderResponse
from app.schemas.platform import (
    AdminOverview,
    AdminSettings,
    AdminSettingsUpdate,
    BankDetailsUpdate,
    DailyRevenue,
    DeliveryStageUpdate,
    EarningsResponse,
    PayoutCreate,
    PayoutDue,
    PayoutResponse,
    PublicSettings,
)
from app.services import messages, payments
from app.services.checkout_flow import as_utc
from app.services.email import email_enabled, send_all, send_email
from app.services.platform import get_platform_settings

router = APIRouter(tags=["Operations"])

ZERO = Decimal("0")


# ---------- Settings ----------


@router.get("/settings/public", response_model=PublicSettings)
def public_settings(db: Session = Depends(get_db)):
    row = get_platform_settings(db)
    db.commit()
    return row


@router.get("/admin/settings", response_model=AdminSettings)
def admin_get_settings(
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    row = get_platform_settings(db)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/admin/settings", response_model=AdminSettings)
def admin_update_settings(
    data: AdminSettingsUpdate,
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    row = get_platform_settings(db)
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if value is None and key in {"commission_percent", "service_area"}:
            continue  # required settings can't be blanked
        setattr(row, key, str(value) if key == "support_email" and value else value)
    db.commit()
    db.refresh(row)
    return row


# ---------- Farmer: bank details and earnings ----------


def _own_profile(user: User, db: Session) -> FarmerProfile:
    profile = db.scalar(select(FarmerProfile).where(FarmerProfile.user_id == user.id))
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Set up your farm profile first.")
    return profile


@router.put("/farmers/me/bank", response_model=FarmerProfileResponse)
def save_bank_details(
    data: BankDetailsUpdate,
    current_user: User = Depends(require_role("farmer")),
    db: Session = Depends(get_db),
):
    profile = _own_profile(current_user, db)
    profile.bank_name = data.bank_name
    profile.account_number = data.account_number
    profile.account_name = data.account_name
    profile.bank_updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(profile)
    return profile


def _payable_filter():
    """Delivered, paid orders that haven't been paid out yet."""
    return (
        Order.status == "completed",
        Order.payment_status == "paid",
        Order.checkout_id.is_not(None),
        Order.payout_id.is_(None),
    )


@router.get("/farmers/me/earnings", response_model=EarningsResponse)
def my_earnings(
    current_user: User = Depends(require_role("farmer")),
    db: Session = Depends(get_db),
):
    profile = _own_profile(current_user, db)
    owed_orders = db.scalars(select(Order).where(Order.farmer_id == current_user.id, *_payable_filter())).all()
    in_progress = db.scalars(
        select(Order).where(
            Order.farmer_id == current_user.id,
            Order.payment_status == "paid",
            Order.status.in_(("pending", "accepted", "ready_for_fulfillment")),
        )
    ).all()
    payouts = db.scalars(
        select(Payout).where(Payout.farmer_id == current_user.id).order_by(Payout.created_at.desc()).limit(50)
    ).all()
    row = get_platform_settings(db)
    db.commit()
    return EarningsResponse(
        commission_percent=row.commission_percent,
        owed=sum((o.farmer_amount for o in owed_orders), ZERO),
        owed_orders=len(owed_orders),
        in_progress=sum((o.farmer_amount for o in in_progress), ZERO),
        in_progress_orders=len(in_progress),
        paid_out=sum((p.amount for p in payouts), ZERO),
        payouts=[PayoutResponse.model_validate(p) for p in payouts],
        has_bank_details=bool(profile.account_number),
    )


# ---------- Admin: payouts ----------


@router.get("/admin/payouts/due", response_model=list[PayoutDue])
def payouts_due(
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    grouped: dict[UUID, list[Order]] = defaultdict(list)
    for order in db.scalars(select(Order).where(*_payable_filter())):
        grouped[order.farmer_id].append(order)

    due = []
    for farmer_id, orders in grouped.items():
        farmer = orders[0].farmer
        profile = farmer.farmer_profile
        gross = sum((o.total_price for o in orders), ZERO)
        commission = sum((o.commission_amount for o in orders), ZERO)
        due.append(
            PayoutDue(
                farmer_id=farmer_id,
                farm_name=profile.farm_name if profile else farmer.full_name,
                farmer_name=farmer.full_name,
                phone=profile.phone if profile else "",
                bank_name=profile.bank_name if profile else None,
                account_number=profile.account_number if profile else None,
                account_name=profile.account_name if profile else None,
                bank_updated_at=profile.bank_updated_at if profile else None,
                order_count=len(orders),
                gross_amount=gross,
                commission_amount=commission,
                amount=gross - commission,
                oldest_delivered_at=min(o.updated_at for o in orders),
            )
        )
    return sorted(due, key=lambda d: as_utc(d.oldest_delivered_at))


@router.get("/admin/payouts", response_model=list[PayoutResponse])
def payout_history(
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    return list(db.scalars(select(Payout).order_by(Payout.created_at.desc()).limit(200)))


@router.post("/admin/payouts", response_model=PayoutResponse, status_code=status.HTTP_201_CREATED)
def record_payout(
    data: PayoutCreate,
    background: BackgroundTasks,
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Record a bank transfer an admin has made to a farm.

    Covers every delivered, paid order the farm hasn't been paid for yet.
    """
    profile = db.scalar(select(FarmerProfile).where(FarmerProfile.user_id == data.farmer_id))
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Farm not found.")
    if not profile.account_number:
        raise HTTPException(status.HTTP_409_CONFLICT, "This farm hasn't added bank details yet.")

    orders = db.scalars(select(Order).where(Order.farmer_id == data.farmer_id, *_payable_filter())).all()
    if not orders:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nothing is owed to this farm right now.")

    gross = sum((o.total_price for o in orders), ZERO)
    commission = sum((o.commission_amount for o in orders), ZERO)
    payout = Payout(
        farmer_id=data.farmer_id,
        amount=gross - commission,
        gross_amount=gross,
        commission_amount=commission,
        order_count=len(orders),
        bank_name=profile.bank_name,
        account_number=profile.account_number,
        account_name=profile.account_name,
        transfer_reference=data.transfer_reference,
        note=data.note,
        recorded_by_id=current_admin.id,
    )
    db.add(payout)
    db.flush()
    # Guarded: an order can only ever be paid out once.
    claimed = db.execute(
        update(Order)
        .where(Order.id.in_([o.id for o in orders]), Order.payout_id.is_(None))
        .values(payout_id=payout.id)
        .execution_options(synchronize_session=False)
    )
    if claimed.rowcount != len(orders):
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "These orders changed. Refresh and try again.")
    db.commit()
    db.refresh(payout)

    background.add_task(
        send_email,
        messages.farmer_payout(
            profile.user.email, profile.user.full_name, payout.amount, payout.order_count,
            payout.bank_name, payout.account_number, payout.transfer_reference,
        ),
    )
    return payout


# ---------- Admin: delivery dispatch ----------


@router.get("/admin/dispatch", response_model=list[OrderResponse])
def dispatch_board(
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """Paid orders the farms are preparing or have ready, for delivery."""
    return list(
        db.scalars(
            select(Order)
            .outerjoin(Checkout, Checkout.id == Order.checkout_id)
            .where(
                Order.status.in_(("accepted", "ready_for_fulfillment")),
                (Order.checkout_id.is_(None)) | (Checkout.status == "paid"),
            )
            .order_by(Order.created_at.asc())
        )
    )


DELIVERY_STEPS = {
    None: {"picked_up", "out_for_delivery", "delivered"},
    "picked_up": {"out_for_delivery", "delivered"},
    "out_for_delivery": {"delivered"},
}


@router.patch("/admin/orders/{order_id}/delivery", response_model=OrderResponse)
def update_delivery(
    order_id: UUID,
    data: DeliveryStageUpdate,
    background: BackgroundTasks,
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    order = db.get(Order, order_id)
    if order is None or not order.visible_to_farmer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    if order.status != "ready_for_fulfillment":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only orders the farm has marked ready can be delivered.")
    if data.stage not in DELIVERY_STEPS.get(order.delivery_stage, set()):
        raise HTTPException(status.HTTP_409_CONFLICT, "This order is already past that step.")

    values: dict = {"delivery_stage": data.stage, "updated_at": func.now()}
    if data.stage == "delivered":
        values["status"] = "completed"
    changed = db.execute(
        update(Order)
        .where(Order.id == order.id, Order.status == "ready_for_fulfillment",
               Order.delivery_stage.is_(None) if order.delivery_stage is None else Order.delivery_stage == order.delivery_stage)
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    if changed.rowcount != 1:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "The order has changed. Refresh and try again.")
    db.commit()
    db.refresh(order)

    amount = f"{order.quantity.normalize():f} {order.unit}"
    if data.stage == "out_for_delivery":
        background.add_task(send_email, messages.buyer_on_the_way(
            order.buyer.email, order.buyer.full_name, order.product_name, amount, order.buyer_phone))
    elif data.stage == "delivered":
        background.add_task(send_all, [
            messages.farmer_order_closed(order.farmer.email, order.farmer.full_name, order.product_name,
                                         amount, order.buyer.full_name, "completed"),
        ])
    return order


# ---------- Admin: overview ----------


@router.get("/admin/overview", response_model=AdminOverview)
def admin_overview(
    current_admin: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    since_30 = today - timedelta(days=29)

    paid = db.scalars(select(Checkout).where(Checkout.status == "paid", Checkout.paid_at >= since_30)).all()
    by_day: dict[str, list[Checkout]] = defaultdict(list)
    for checkout in paid:
        by_day[as_utc(checkout.paid_at).date().isoformat()].append(checkout)
    daily = []
    for i in range(30):
        day = (since_30 + timedelta(days=i)).date().isoformat()
        rows = by_day.get(day, [])
        daily.append(DailyRevenue(day=day, amount=sum((c.amount_total for c in rows), ZERO), orders=len(rows)))

    def revenue(since: datetime) -> Decimal:
        return sum((c.amount_total for c in paid if as_utc(c.paid_at) >= since), ZERO)

    recent_orders = db.scalars(
        select(Order).where(Order.payment_status == "paid", Order.created_at >= since_30)
    ).all()
    owed = db.scalars(select(Order).where(*_payable_filter())).all()
    row = get_platform_settings(db)
    counts = lambda q: db.scalar(select(func.count()).select_from(q.subquery())) or 0  # noqa: E731
    visible = (Order.checkout_id.is_(None)) | (Checkout.status == "paid")
    base = select(Order.id).outerjoin(Checkout, Checkout.id == Order.checkout_id).where(visible)

    overview = AdminOverview(
        orders_today=sum(len(c.orders) for c in paid if as_utc(c.paid_at) >= today),
        revenue_today=revenue(today),
        revenue_7_days=revenue(today - timedelta(days=6)),
        revenue_30_days=revenue(since_30),
        commission_30_days=sum(
            (o.commission_amount for o in recent_orders if o.status not in {"rejected", "cancelled"}), ZERO
        ),
        farms_pending=counts(select(FarmerProfile.id).where(FarmerProfile.verification_status == "pending")),
        farms_approved=counts(select(FarmerProfile.id).where(FarmerProfile.verification_status == "approved")),
        refunds_due=counts(select(Order.id).where(Order.payment_status == "refund_pending")),
        awaiting_farm=counts(base.where(Order.status == "pending")),
        ready_for_pickup=counts(base.where(Order.status == "ready_for_fulfillment",
                                           Order.delivery_stage.is_(None))),
        on_the_way=counts(base.where(Order.status == "ready_for_fulfillment",
                                     Order.delivery_stage.in_(("picked_up", "out_for_delivery")))),
        payouts_owed=sum((o.farmer_amount for o in owed), ZERO),
        payouts_owed_farms=len({o.farmer_id for o in owed}),
        live_listings=counts(select(Product.id).where(Product.is_available.is_(True),
                                                      Product.quantity_available > 0)),
        buyers=counts(select(User.id).where(User.role == "buyer")),
        daily=daily,
        commission_percent=row.commission_percent,
        setup={
            "payments": bool(payments.enabled_providers()),
            "email": email_enabled(),
            "delivery_areas": bool(db.scalar(select(func.count(DeliveryZone.id)).where(DeliveryZone.is_active.is_(True)))),
            "commission": row.commission_percent > 0,
            "support_contact": bool(row.support_email or row.support_phone),
            "operator_name": bool(row.operator_name),
            "error_alerts": bool(settings.sentry_dsn),
        },
    )
    db.commit()
    return overview

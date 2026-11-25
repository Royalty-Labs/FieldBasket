import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Numeric, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

CHECKOUT_STATUSES = ("awaiting_payment", "paid", "failed", "expired")
PAYMENT_PROVIDERS = ("paystack", "interswitch")


class Checkout(Base):
    """One payment covering a buyer's whole basket.

    Each item in the basket is its own Order (one per farm product); the
    checkout holds the money side: provider, reference, totals, delivery.
    """

    __tablename__ = "checkouts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('awaiting_payment', 'paid', 'failed', 'expired')",
            name="ck_checkout_status_valid",
        ),
        CheckConstraint("provider IN ('paystack', 'interswitch')", name="ck_checkout_provider_valid"),
        CheckConstraint("amount_total >= 0", name="ck_checkout_amount_nonnegative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    buyer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="awaiting_payment", server_default="awaiting_payment", nullable=False
    )

    items_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    amount_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    delivery_fee_refunded: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0", nullable=False
    )

    delivery_zone_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("delivery_zones.id", ondelete="SET NULL"), nullable=True
    )
    delivery_zone_name: Mapped[str] = mapped_column(String(100), nullable=False)
    delivery_address: Mapped[str] = mapped_column(String(250), nullable=False)
    buyer_phone: Mapped[str] = mapped_column(String(30), nullable=False)
    buyer_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    payment_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    provider_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    buyer: Mapped["User"] = relationship(foreign_keys=[buyer_id])
    orders: Mapped[list["Order"]] = relationship(back_populates="checkout")

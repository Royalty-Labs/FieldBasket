import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Order(Base):
    __tablename__ = "orders"

    __table_args__ = (
        CheckConstraint(
            "quantity > 0",
            name="ck_order_quantity_positive",
        ),
        CheckConstraint(
            "unit_price >= 0",
            name="ck_order_unit_price_nonnegative",
        ),
        CheckConstraint(
            "total_price >= 0",
            name="ck_order_total_price_nonnegative",
        ),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected', "
            "'ready_for_fulfillment', 'completed', 'cancelled')",
            name="ck_order_status_valid",
        ),
        CheckConstraint(
            "payment_status IN ('not_required', 'awaiting', 'paid', "
            "'failed', 'refund_pending', 'refunded')",
            name="ck_order_payment_status_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    buyer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    farmer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )

    # SET NULL preserves order history if a product listing is deleted.
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("products.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    product_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )
    unit: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )
    quantity: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )
    total_price: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
    )

    delivery_address: Mapped[str] = mapped_column(
        String(250),
        nullable=False,
    )
    buyer_note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    rejection_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="pending",
        server_default="pending",
    )

    # Orders placed through a paid checkout. Older orders have none.
    checkout_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("checkouts.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    # not_required (before online payment), awaiting, paid, failed,
    # refund_pending or refunded.
    payment_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="not_required",
        server_default="not_required",
    )
    buyer_phone: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    checkout: Mapped["Checkout | None"] = relationship(back_populates="orders")
    buyer: Mapped["User"] = relationship(foreign_keys=[buyer_id])
    farmer: Mapped["User"] = relationship(foreign_keys=[farmer_id])

    @property
    def buyer_name(self) -> str | None:
        """Buyer's name, shown to the farmer fulfilling the order."""
        return self.buyer.full_name if self.buyer else None

    @property
    def farm_name(self) -> str | None:
        """Farm's display name, shown to the buyer."""
        if self.farmer is None:
            return None
        profile = self.farmer.farmer_profile
        return profile.farm_name if profile else self.farmer.full_name

    @property
    def delivery_zone_name(self) -> str | None:
        return self.checkout.delivery_zone_name if self.checkout else None

    @property
    def checkout_reference(self) -> str | None:
        return self.checkout.reference if self.checkout else None

    @property
    def visible_to_farmer(self) -> bool:
        """Farmers only see orders that were paid in time (or need no payment)."""
        return self.checkout is None or self.checkout.status == "paid"

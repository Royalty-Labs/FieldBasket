import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PlatformSettings(Base):
    """Business settings an admin changes from the admin console.

    There is exactly one row (id 1). Empty contact fields are simply not
    shown on the website.
    """

    __tablename__ = "platform_settings"
    __table_args__ = (
        CheckConstraint(
            "commission_percent >= 0 AND commission_percent <= 50",
            name="ck_platform_commission_range",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    # Share of each item's price FieldBasket keeps; the rest goes to the farm.
    commission_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0"), server_default="0"
    )
    service_area: Mapped[str] = mapped_column(
        String(100), nullable=False, default="Ekiti State", server_default="Ekiti State"
    )
    # The registered business that operates FieldBasket (shown in the legal pages).
    operator_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    support_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    support_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    support_whatsapp: Mapped[str | None] = mapped_column(String(30), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Payout(Base):
    """Money sent to a farm for its delivered, paid orders."""

    __tablename__ = "payouts"
    __table_args__ = (CheckConstraint("amount >= 0", name="ck_payout_amount_nonnegative"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    commission_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    order_count: Mapped[int] = mapped_column(Integer, nullable=False)
    # Copied at payout time so history stays right if the farm changes them later.
    bank_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    account_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    account_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    transfer_reference: Mapped[str] = mapped_column(String(100), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    farmer: Mapped["User"] = relationship(foreign_keys=[farmer_id])

    @property
    def farm_name(self) -> str | None:
        profile = self.farmer.farmer_profile if self.farmer else None
        return profile.farm_name if profile else None

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, Numeric, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DeliveryZone(Base):
    """An area FieldBasket delivers to, with a flat fee set by admins."""

    __tablename__ = "delivery_zones"
    __table_args__ = (CheckConstraint("fee >= 0", name="ck_delivery_zone_fee_nonnegative"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(250), nullable=True)
    fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

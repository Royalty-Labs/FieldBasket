import re
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    value = " ".join(value.split())
    return value or None


class PublicSettings(BaseModel):
    """What the website shows visitors (no commission)."""

    model_config = ConfigDict(from_attributes=True)

    service_area: str
    operator_name: str | None
    support_email: str | None
    support_phone: str | None
    support_whatsapp: str | None


class AdminSettings(PublicSettings):
    commission_percent: Decimal
    updated_at: datetime


class AdminSettingsUpdate(BaseModel):
    commission_percent: Decimal | None = Field(default=None, ge=0, le=50, max_digits=5, decimal_places=2)
    service_area: str | None = Field(default=None, min_length=2, max_length=100)
    operator_name: str | None = Field(default=None, max_length=150)
    support_email: EmailStr | None = None
    support_phone: str | None = Field(default=None, max_length=30)
    support_whatsapp: str | None = Field(default=None, max_length=30)

    @field_validator("service_area", "operator_name", "support_phone", "support_whatsapp", mode="before")
    @classmethod
    def clean(cls, value):
        return _clean_optional(value) if isinstance(value, str) else value

    @field_validator("support_email", mode="before")
    @classmethod
    def blank_email(cls, value):
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("support_phone", "support_whatsapp")
    @classmethod
    def phone_like(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(r"\+?[0-9 ()-]{7,30}", value):
            raise ValueError("Enter a valid phone number.")
        return value


class BankDetailsUpdate(BaseModel):
    bank_name: str = Field(min_length=2, max_length=100)
    account_number: str = Field(min_length=10, max_length=10)
    account_name: str = Field(min_length=2, max_length=150)

    @field_validator("bank_name", "account_name", mode="before")
    @classmethod
    def clean(cls, value):
        return " ".join(value.split()) if isinstance(value, str) else value

    @field_validator("account_number", mode="before")
    @classmethod
    def digits(cls, value):
        value = re.sub(r"\s", "", value) if isinstance(value, str) else value
        if not isinstance(value, str) or not re.fullmatch(r"\d{10}", value):
            raise ValueError("Nigerian account numbers have 10 digits.")
        return value


class PayoutCreate(BaseModel):
    farmer_id: UUID
    transfer_reference: str = Field(min_length=3, max_length=100)
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("transfer_reference", "note", mode="before")
    @classmethod
    def clean(cls, value):
        return _clean_optional(value) if isinstance(value, str) else value


class PayoutResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    farmer_id: UUID
    farm_name: str | None
    amount: Decimal
    gross_amount: Decimal
    commission_amount: Decimal
    order_count: int
    bank_name: str | None
    account_number: str | None
    account_name: str | None
    transfer_reference: str
    note: str | None
    created_at: datetime


class PayoutDue(BaseModel):
    farmer_id: UUID
    farm_name: str
    farmer_name: str
    phone: str
    bank_name: str | None
    account_number: str | None
    account_name: str | None
    bank_updated_at: datetime | None
    order_count: int
    gross_amount: Decimal
    commission_amount: Decimal
    amount: Decimal
    oldest_delivered_at: datetime


class EarningsResponse(BaseModel):
    commission_percent: Decimal
    owed: Decimal
    owed_orders: int
    in_progress: Decimal
    in_progress_orders: int
    paid_out: Decimal
    payouts: list[PayoutResponse]
    has_bank_details: bool


class DeliveryStageUpdate(BaseModel):
    stage: str = Field(pattern="^(picked_up|out_for_delivery|delivered)$")


class DailyRevenue(BaseModel):
    day: str
    amount: Decimal
    orders: int


class AdminOverview(BaseModel):
    orders_today: int
    revenue_today: Decimal
    revenue_7_days: Decimal
    revenue_30_days: Decimal
    commission_30_days: Decimal
    farms_pending: int
    farms_approved: int
    refunds_due: int
    awaiting_farm: int
    ready_for_pickup: int
    on_the_way: int
    payouts_owed: Decimal
    payouts_owed_farms: int
    live_listings: int
    buyers: int
    daily: list[DailyRevenue]
    commission_percent: Decimal
    setup: dict[str, bool]

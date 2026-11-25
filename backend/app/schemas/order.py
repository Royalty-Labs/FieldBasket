from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


OrderStatus = Literal[
    "pending",
    "accepted",
    "rejected",
    "ready_for_fulfillment",
    "completed",
    "cancelled",
]


class OrderCreate(BaseModel):
    product_id: UUID
    quantity: Decimal = Field(
        gt=0,
        max_digits=12,
        decimal_places=2,
    )
    delivery_address: str = Field(
        min_length=5,
        max_length=250,
    )
    buyer_note: str | None = Field(
        default=None,
        max_length=2000,
    )

    @field_validator("delivery_address")
    @classmethod
    def clean_delivery_address(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Delivery address cannot be blank.")
        return value

    @field_validator("buyer_note")
    @classmethod
    def clean_buyer_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class CheckoutItem(BaseModel):
    product_id: UUID
    quantity: Decimal = Field(
        gt=0,
        max_digits=12,
        decimal_places=2,
    )


class CheckoutRequest(BaseModel):
    """A buyer's whole basket. Each item becomes its own order."""

    items: list[CheckoutItem] = Field(min_length=1, max_length=30)
    provider: Literal["paystack", "interswitch"]
    delivery_zone_id: UUID
    buyer_phone: str = Field(min_length=7, max_length=30)
    delivery_address: str = Field(
        min_length=5,
        max_length=250,
    )
    buyer_note: str | None = Field(
        default=None,
        max_length=2000,
    )

    @field_validator("delivery_address")
    @classmethod
    def clean_delivery_address(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Delivery address cannot be blank.")
        return value

    @field_validator("buyer_note")
    @classmethod
    def clean_buyer_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("buyer_phone")
    @classmethod
    def clean_phone(cls, value: str) -> str:
        value = " ".join(value.split())
        digits = [c for c in value if c.isdigit()]
        if len(digits) < 7 or any(c not in "+0123456789 -()" for c in value):
            raise ValueError("Enter a valid phone number.")
        return value

    @model_validator(mode="after")
    def check_unique_products(self) -> "CheckoutRequest":
        product_ids = [item.product_id for item in self.items]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("Each product can only appear once in a checkout.")
        return self


class CheckoutResponse(BaseModel):
    """Where to send the buyer to pay."""

    reference: str
    provider: str
    amount_total: Decimal
    redirect_url: str | None = None
    form_action: str | None = None
    form_fields: dict[str, str] = {}


class PaymentStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    reference: str
    provider: str
    status: str
    items_total: Decimal
    delivery_fee: Decimal
    amount_total: Decimal
    delivery_zone_name: str
    order_count: int
    paid_at: datetime | None


class OrderStatusUpdate(BaseModel):
    status: Literal[
        "accepted",
        "rejected",
        "ready_for_fulfillment",
        "completed",
        "cancelled",
    ]
    rejection_reason: str | None = Field(
        default=None,
        max_length=2000,
    )

    @field_validator("rejection_reason")
    @classmethod
    def clean_rejection_reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @model_validator(mode="after")
    def validate_rejection_reason(self):
        if self.status == "rejected" and not self.rejection_reason:
            raise ValueError(
                "A reason is required when rejecting an order."
            )
        if self.status != "rejected" and self.rejection_reason:
            raise ValueError(
                "A rejection reason is only allowed when rejecting an order."
            )
        return self


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    buyer_id: UUID
    farmer_id: UUID
    product_id: UUID | None
    product_name: str
    unit: str
    quantity: Decimal
    unit_price: Decimal
    total_price: Decimal
    delivery_address: str
    buyer_note: str | None
    rejection_reason: str | None
    status: OrderStatus
    payment_status: str
    delivery_stage: str | None = None
    commission_percent: Decimal = Decimal("0")
    farmer_amount: Decimal | None = None
    farm_phone: str | None = None
    farm_town: str | None = None
    farm_address: str | None = None
    buyer_phone: str | None = None
    delivery_zone_name: str | None = None
    checkout_reference: str | None = None
    buyer_name: str | None = None
    farm_name: str | None = None
    created_at: datetime
    updated_at: datetime

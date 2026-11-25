from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DeliveryZoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    fee: Decimal
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class DeliveryZoneCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=250)
    fee: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0, le=10_000)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Name is too short.")
        return value

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        return (value or "").strip() or None


class DeliveryZoneUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=250)
    fee: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=10_000)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return " ".join(value.split()) if value is not None else None

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class FarmerProfileCreate(BaseModel):
    farm_name: str = Field(min_length=2, max_length=150)
    phone: str = Field(min_length=7, max_length=30)
    town: str = Field(min_length=2, max_length=100)
    address: str | None = Field(default=None, max_length=1000)

    @field_validator("farm_name", "phone", "town")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @field_validator("address")
    @classmethod
    def clean_address(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class FarmerProfileUpdate(BaseModel):
    farm_name: str | None = Field(default=None, min_length=2, max_length=150)
    phone: str | None = Field(default=None, min_length=7, max_length=30)
    town: str | None = Field(default=None, min_length=2, max_length=100)
    address: str | None = Field(default=None, max_length=1000)

    @field_validator("farm_name", "phone", "town")
    @classmethod
    def strip_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @field_validator("address")
    @classmethod
    def clean_address(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @model_validator(mode="after")
    def require_at_least_one_change(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one field to update.")

        for field in ("farm_name", "phone", "town"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field.replace('_', ' ').capitalize()} cannot be null.")

        return self


class FarmerProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    farm_name: str
    phone: str
    state: str
    town: str
    address: str | None
    verification_status: Literal["pending", "approved", "rejected"]
    rejection_reason: str | None
    bank_name: str | None = None
    account_number: str | None = None
    account_name: str | None = None
    bank_updated_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

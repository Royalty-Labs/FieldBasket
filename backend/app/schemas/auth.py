from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal["buyer", "farmer"] = "buyer"
    # The website asks people to agree to the Terms and Privacy Policy.
    accept_terms: bool | None = None

    @field_validator("accept_terms")
    @classmethod
    def must_accept(cls, value: bool | None) -> bool | None:
        if value is False:
            raise ValueError("Please agree to the Terms and Privacy Policy to create an account.")
        return value

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Full name must contain at least 2 characters.")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    email: EmailStr
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=20, max_length=2000)
    password: str = Field(min_length=8, max_length=128)

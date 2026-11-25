from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limit import login_limiter
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    create_password_reset_token,
    hash_password,
    password_fingerprint_matches,
    read_password_reset_token,
    verify_password,
)
from app.core.config import settings
from app.core.rate_limit import reset_limiter
from app.services import messages
from app.services.email import send_email
from app.db.session import get_db
from app.models import User
from app.schemas.auth import (
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    data: RegisterRequest,
    db: Session = Depends(get_db),
) -> User:
    email = str(data.email).strip().lower()

    existing_user = db.scalar(
        select(User).where(User.email == email)
    )

    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        full_name=data.full_name,
        email=email,
        password_hash=hash_password(data.password),
        role=data.role,
        terms_accepted_at=datetime.now(timezone.utc) if data.accept_terms else None,
    )

    db.add(user)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from None

    return user


@router.post("/login", response_model=TokenResponse)
def login(
    data: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    email = str(data.email).strip().lower()

    retry_after = login_limiter.retry_after(email)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-in attempts. Please wait a few minutes and try again.",
            headers={"Retry-After": str(retry_after)},
        )

    user = db.scalar(
        select(User).where(User.email == email)
    )

    # Always run one password check so unknown emails take as long to
    # reject as wrong passwords (no hint about which emails are registered).
    password_ok = verify_password(
        data.password,
        user.password_hash if user is not None else DUMMY_PASSWORD_HASH,
    )

    if user is None or not password_ok or not user.is_active:
        login_limiter.record_failure(email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    login_limiter.reset(email)
    token = create_access_token(user.id)

    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
def request_password_reset(
    data: PasswordResetRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict:
    """Email a reset link. Always answers the same way, so it can't be
    used to find out which emails have accounts."""
    email = str(data.email).strip().lower()
    reply = {"detail": "If that email has an account, a reset link is on its way."}

    if reset_limiter.retry_after(email):
        return reply
    reset_limiter.record_failure(email)

    user = db.scalar(select(User).where(User.email == email))
    if user is not None and user.is_active:
        token = create_password_reset_token(user.id, user.password_hash)
        link = f"{settings.frontend_base}/reset-password?token={token}"
        background.add_task(send_email, messages.password_reset(user.email, user.full_name, link))
    return reply


@router.post("/password-reset/confirm")
def confirm_password_reset(
    data: PasswordResetConfirm,
    db: Session = Depends(get_db),
) -> dict:
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This reset link is invalid or has expired. Ask for a new one.",
    )
    try:
        user_id, fingerprint = read_password_reset_token(data.token)
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise invalid from None

    user = db.get(User, user_id)
    if user is None or not user.is_active or not password_fingerprint_matches(user.password_hash, fingerprint):
        raise invalid

    user.password_hash = hash_password(data.password)
    db.commit()
    login_limiter.reset(user.email)
    return {"detail": "Your password has been changed. You can sign in now."}

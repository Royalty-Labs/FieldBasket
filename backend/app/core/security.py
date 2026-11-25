import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from pwdlib import PasswordHash

from app.core.config import settings


password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


# A real hash of a random value, used to keep failed sign-ins for unknown
# emails as slow as those for known ones.
DUMMY_PASSWORD_HASH = password_hash.hash("fieldbasket-timing-placeholder")


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def create_access_token(user_id: UUID) -> str:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(
        minutes=settings.access_token_expire_minutes
    )

    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": expires_at,
    }

    return jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
        options={"require": ["sub", "exp"]},
    )
    if payload.get("purpose"):
        # A password-reset link is not a sign-in.
        raise jwt.InvalidTokenError("Not an access token.")
    return payload


RESET_TOKEN_MINUTES = 60


def _password_fingerprint(password_hash_value: str) -> str:
    return hashlib.sha256(password_hash_value.encode()).hexdigest()[:20]


def create_password_reset_token(user_id: UUID, current_password_hash: str) -> str:
    """A one-hour link that stops working once the password changes."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "purpose": "password_reset",
        "pwd": _password_fingerprint(current_password_hash),
        "iat": now,
        "exp": now + timedelta(minutes=RESET_TOKEN_MINUTES),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def read_password_reset_token(token: str) -> tuple[UUID, str]:
    """Returns (user id, password fingerprint). Raises if invalid."""
    payload = jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
        options={"require": ["sub", "exp", "purpose", "pwd"]},
    )
    if payload["purpose"] != "password_reset":
        raise jwt.InvalidTokenError("Not a reset token.")
    return UUID(payload["sub"]), payload["pwd"]


def password_fingerprint_matches(current_password_hash: str, fingerprint: str) -> bool:
    return hmac.compare_digest(_password_fingerprint(current_password_hash), fingerprint)

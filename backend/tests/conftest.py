import pytest

from app.core.config import settings
from app.core.rate_limit import login_limiter, reset_limiter


@pytest.fixture(autouse=True)
def reset_limiters():
    """Each test starts with no recorded failed sign-ins or reset requests."""
    login_limiter.reset()
    reset_limiter.reset()
    yield
    login_limiter.reset()
    reset_limiter.reset()


@pytest.fixture(autouse=True)
def allow_unpaid_single_orders(monkeypatch):
    """Older tests place single orders directly, without a payment."""
    monkeypatch.setattr(settings, "allow_unpaid_orders", True)

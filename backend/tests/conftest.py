import pytest

from app.core.rate_limit import login_limiter


@pytest.fixture(autouse=True)
def reset_login_limiter():
    """Each test starts with no recorded failed sign-ins."""
    login_limiter.reset()
    yield
    login_limiter.reset()

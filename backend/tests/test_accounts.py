"""Password reset, terms consent and email alerts."""

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, create_password_reset_token
from app.models import User
from app.services import email as email_service
from tests.test_farmer_workflow import (  # noqa: F401
    create_admin,
    create_profile,
    login_existing,
    register_and_login,
    workflow,
)


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(email_service, "send_email", sent.append)
    # Routes import send_email/send_all by name; patch those too.
    import app.api.routes.admin as admin_routes
    import app.api.routes.auth as auth_routes

    monkeypatch.setattr(auth_routes, "send_email", sent.append)
    monkeypatch.setattr(admin_routes, "send_email", sent.append)
    monkeypatch.setattr(email_service, "send_all", lambda emails: sent.extend(emails))
    for module in ("app.api.routes.orders", "app.api.routes.farmers", "app.api.routes.payments"):
        monkeypatch.setattr(f"{module}.send_all", lambda emails: sent.extend(emails))
    return sent


def _reset_link_token(outbox):
    link = outbox[-1].action_url
    return link.split("token=", 1)[1]


def test_password_reset_flow(workflow, outbox):
    client, _ = workflow
    register_and_login(client, "ada@example.com", "buyer")

    reply = client.post("/auth/password-reset/request", json={"email": "ADA@example.com"})
    assert reply.status_code == 202
    assert outbox[-1].to == "ada@example.com"
    token = _reset_link_token(outbox)

    # The link isn't a sign-in.
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401

    done = client.post("/auth/password-reset/confirm", json={"token": token, "password": "NewSecret456!"})
    assert done.status_code == 200
    assert client.post("/auth/login", json={"email": "ada@example.com", "password": "NewSecret456!"}).status_code == 200
    assert client.post("/auth/login", json={"email": "ada@example.com", "password": "SecurePass123!"}).status_code == 401

    # Used once; it doesn't work again.
    again = client.post("/auth/password-reset/confirm", json={"token": token, "password": "Another789!"})
    assert again.status_code == 400


def test_password_reset_does_not_reveal_accounts(workflow, outbox):
    client, _ = workflow
    reply = client.post("/auth/password-reset/request", json={"email": "nobody@example.com"})
    assert reply.status_code == 202
    assert outbox == []


def test_password_reset_requests_are_limited(workflow, outbox):
    client, _ = workflow
    register_and_login(client, "ada@example.com", "buyer")
    for _ in range(5):
        client.post("/auth/password-reset/request", json={"email": "ada@example.com"})
    assert len(outbox) == 3


def test_bad_and_wrong_purpose_tokens_are_refused(workflow, outbox):
    client, session_factory = workflow
    register_and_login(client, "ada@example.com", "buyer")
    with session_factory() as db:
        user = db.scalar(select(User).where(User.email == "ada@example.com"))
        access = create_access_token(user.id)
        stale = create_password_reset_token(user.id, "an-old-password-hash")

    for token in (access, stale, "x" * 40):
        response = client.post("/auth/password-reset/confirm", json={"token": token, "password": "NewSecret456!"})
        assert response.status_code == 400


def test_terms_consent_is_recorded(workflow):
    client, session_factory = workflow
    refused = client.post(
        "/auth/register",
        json={"full_name": "No Consent", "email": "no@example.com", "password": "SecurePass123!", "accept_terms": False},
    )
    assert refused.status_code == 422

    agreed = client.post(
        "/auth/register",
        json={"full_name": "Yes Consent", "email": "yes@example.com", "password": "SecurePass123!", "accept_terms": True},
    )
    assert agreed.status_code == 201
    with session_factory() as db:
        assert db.scalar(select(User.terms_accepted_at).where(User.email == "yes@example.com")) is not None


def test_admins_hear_about_new_farms_and_farmers_hear_the_result(workflow, outbox):
    client, session_factory = workflow
    create_admin(session_factory)
    farmer = register_and_login(client, "farmer@example.com", "farmer")
    profile = create_profile(client, farmer).json()

    alert = outbox[-1]
    assert alert.to == "admin@example.com"
    assert "Green Acres" in alert.subject

    admin = login_existing(client, "admin@example.com")
    client.patch(
        f"/admin/farmer-profiles/{profile['id']}/review",
        headers=admin,
        json={"verification_status": "approved"},
    )
    assert outbox[-1].to == "farmer@example.com"
    assert "verified" in outbox[-1].subject


def test_email_is_skipped_until_configured(caplog):
    caplog.set_level("INFO")
    email_service.send_email(email_service.Email(to="a@example.com", subject="Hi", lines=["Hello"]))
    assert "skipped" in caplog.text

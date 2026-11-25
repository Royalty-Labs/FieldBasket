"""The real Paystack and Interswitch calls, against fake HTTP replies."""

from datetime import datetime, timezone
from decimal import Decimal

import httpx
import pytest

from app.core.config import settings
from app.models import Checkout
from app.services import payments


def _checkout(provider="paystack", amount="6250.00"):
    return Checkout(
        reference="FB-ABC123",
        provider=provider,
        amount_total=Decimal(amount),
        items_total=Decimal(amount),
        delivery_fee=Decimal("0"),
        delivery_zone_name="Ado-Ekiti",
        delivery_address="12 Market Road",
        buyer_phone="08031234567",
        expires_at=datetime.now(timezone.utc),
    )


class Reply:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body
        self.is_success = 200 <= status < 300

    def json(self):
        return self._body


@pytest.fixture
def keys(monkeypatch):
    monkeypatch.setattr(settings, "paystack_secret_key", "sk_test_x")
    monkeypatch.setattr(settings, "interswitch_merchant_code", "MX1")
    monkeypatch.setattr(settings, "interswitch_pay_item_id", "101")
    monkeypatch.setattr(settings, "frontend_url", "https://fieldbasket.test/")


def test_amounts_are_sent_in_kobo():
    assert payments.to_kobo(Decimal("6250.00")) == 625000
    assert payments.to_kobo(Decimal("0.005")) == 1


def test_paystack_initialize(keys, monkeypatch):
    sent = {}

    def fake_post(url, headers, json, timeout):
        sent.update(url=url, headers=headers, json=json)
        return Reply(200, {"status": True, "data": {"authorization_url": "https://checkout.paystack.com/x"}})

    monkeypatch.setattr(payments.httpx, "post", fake_post)
    start = payments.start_payment(_checkout(), "ada@example.com", "Ada")

    assert start.redirect_url == "https://checkout.paystack.com/x"
    assert sent["url"].endswith("/transaction/initialize")
    assert sent["headers"]["Authorization"] == "Bearer sk_test_x"
    assert sent["json"]["amount"] == "625000"
    assert sent["json"]["callback_url"] == "https://fieldbasket.test/payment/return?reference=FB-ABC123"


def test_paystack_errors_become_payment_errors(keys, monkeypatch):
    monkeypatch.setattr(payments.httpx, "post", lambda *a, **k: Reply(401, {"status": False, "message": "bad key"}))
    with pytest.raises(payments.PaymentError):
        payments.start_payment(_checkout(), "a@example.com", "A")

    def offline(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(payments.httpx, "post", offline)
    with pytest.raises(payments.PaymentError):
        payments.start_payment(_checkout(), "a@example.com", "A")


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        ({"status": "success", "amount": 625000, "currency": "NGN", "id": 9}, "paid"),
        ({"status": "success", "amount": 100, "currency": "NGN"}, "failed"),  # underpaid
        ({"status": "failed"}, "failed"),
        ({"status": "abandoned"}, "pending"),
    ],
)
def test_paystack_verify(keys, monkeypatch, data, expected):
    monkeypatch.setattr(payments.httpx, "get", lambda *a, **k: Reply(200, {"status": True, "data": data}))
    assert payments.check_payment(_checkout()).status == expected


def test_interswitch_form_and_requery(keys, monkeypatch):
    start = payments.start_payment(_checkout("interswitch"), "ada@example.com", "Ada")
    assert start.form_action.startswith("https://newwebpay-sandbox.interswitchng.com")
    assert start.form_fields["amount"] == "625000"
    assert start.form_fields["currency"] == "566"
    assert start.form_fields["site_redirect_url"].endswith("reference=FB-ABC123")

    seen = {}

    def fake_get(url, params, headers, timeout):
        seen.update(url=url, params=params)
        return Reply(200, {"ResponseCode": "00", "Amount": 625000, "PaymentReference": "ISW1"})

    monkeypatch.setattr(payments.httpx, "get", fake_get)
    assert payments.check_payment(_checkout("interswitch")).status == "paid"
    assert seen["params"] == {"merchantcode": "MX1", "transactionreference": "FB-ABC123", "amount": 625000}

    monkeypatch.setattr(payments.httpx, "get", lambda *a, **k: Reply(200, {"ResponseCode": "Z6"}))
    assert payments.check_payment(_checkout("interswitch")).status == "pending"


def test_refunds(keys, monkeypatch):
    monkeypatch.setattr(payments.httpx, "post", lambda *a, **k: Reply(200, {"status": True}))
    assert payments.refund(_checkout(), Decimal("1500")) is True
    # Interswitch refunds are done by an admin.
    assert payments.refund(_checkout("interswitch"), Decimal("1500")) is False


def test_providers_appear_only_with_keys(monkeypatch):
    monkeypatch.setattr(settings, "paystack_secret_key", None)
    monkeypatch.setattr(settings, "interswitch_merchant_code", None)
    assert payments.enabled_providers() == []
    monkeypatch.setattr(settings, "paystack_secret_key", "sk")
    assert payments.enabled_providers() == ["paystack"]

"""Paid checkout: reserve the basket, pay, farms see it, refunds."""

import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models import Checkout
from app.services import payments
from app.services.payments import PaymentCheck, PaymentStart
from tests.test_farmer_workflow import login_existing, product_payload, workflow  # noqa: F401
from tests.test_orders import create_marketplace, get_stock


class FakeProviders:
    """Stands in for Paystack and Interswitch."""

    def __init__(self):
        self.results: dict[str, str] = {}  # reference -> paid / failed / pending
        self.refunds: list[tuple[str, str]] = []
        self.fail_start = False

    def start(self, checkout, email, name):
        if self.fail_start:
            raise payments.PaymentError("Paystack could not be reached.")
        if checkout.provider == "paystack":
            return PaymentStart(redirect_url=f"https://pay.test/{checkout.reference}")
        return PaymentStart(form_action="https://isw.test/pay", form_fields={"txn_ref": checkout.reference})

    def check(self, checkout):
        return PaymentCheck(self.results.get(checkout.reference, "pending"), "TX-1")

    def refund(self, checkout, amount):
        if checkout.provider != "paystack":
            return False
        self.refunds.append((checkout.reference, f"{amount:.2f}"))
        return True


@pytest.fixture
def providers(monkeypatch):
    fake = FakeProviders()
    monkeypatch.setattr(settings, "paystack_secret_key", "sk_test_x")
    monkeypatch.setattr(settings, "interswitch_merchant_code", "MX1")
    monkeypatch.setattr(settings, "interswitch_pay_item_id", "101")
    monkeypatch.setattr(payments, "start_payment", fake.start)
    monkeypatch.setattr(payments, "check_payment", fake.check)
    monkeypatch.setattr(payments, "refund", fake.refund)
    return fake


@pytest.fixture
def market(workflow, providers):  # noqa: F811
    client, session_factory = workflow
    farmer_headers, buyer_headers, tomatoes = create_marketplace(client, session_factory)
    admin_headers = login_existing(client, "admin@example.com")
    zone = client.post(
        "/admin/delivery-zones",
        headers=admin_headers,
        json={"name": "Ado-Ekiti", "fee": "1000", "description": "Same or next day"},
    )
    assert zone.status_code == 201, zone.text
    return {
        "client": client,
        "db": session_factory,
        "farmer": farmer_headers,
        "buyer": buyer_headers,
        "admin": admin_headers,
        "tomatoes": tomatoes,
        "zone": zone.json(),
        "providers": providers,
    }


def _second_product(m, **overrides):
    response = m["client"].post(
        "/products", headers=m["farmer"], json=product_payload(name="White yam", unit="tuber", **overrides)
    )
    assert response.status_code == 201, response.text
    return response.json()


def _checkout(m, items, **overrides):
    payload = {
        "items": items,
        "provider": "paystack",
        "delivery_zone_id": m["zone"]["id"],
        "buyer_phone": "0803 123 4567",
        "delivery_address": "12 Ajilosun Street, Ado-Ekiti",
        "buyer_note": "Please call on arrival",
    }
    payload.update(overrides)
    return m["client"].post("/orders/checkout", headers=m["buyer"], json=payload)


def _pay(m, reference):
    m["providers"].results[reference] = "paid"
    response = m["client"].post(f"/payments/{reference}/verify", headers=m["buyer"])
    assert response.status_code == 200, response.text
    return response.json()


def test_checkout_reserves_stock_and_farm_sees_it_only_once_paid(market):
    m = market
    client = m["client"]
    yam = _second_product(m)
    tomato_stock = get_stock(client, m["tomatoes"]["id"])

    response = _checkout(
        m, [{"product_id": m["tomatoes"]["id"], "quantity": "2"}, {"product_id": yam["id"], "quantity": "1.5"}]
    )
    assert response.status_code == 201, response.text
    started = response.json()
    # 2 × 1500 + 1.5 × 1500 + 1000 delivery
    assert started["amount_total"] == "6250.00"
    assert started["redirect_url"].endswith(started["reference"])
    assert get_stock(client, m["tomatoes"]["id"]) == tomato_stock - 2

    # Not paid yet: the farm doesn't see it and can't act on it.
    assert client.get("/orders/farmer", headers=m["farmer"]).json() == []
    mine = client.get("/orders/mine", headers=m["buyer"]).json()
    assert {o["payment_status"] for o in mine} == {"awaiting"}
    cancel = client.patch(f"/orders/{mine[0]['id']}/status", headers=m["buyer"], json={"status": "cancelled"})
    assert cancel.status_code == 409

    paid = _pay(m, started["reference"])
    assert paid["status"] == "paid"
    assert paid["order_count"] == 2

    farm_orders = client.get("/orders/farmer", headers=m["farmer"]).json()
    assert len(farm_orders) == 2
    assert farm_orders[0]["buyer_phone"] == "0803 123 4567"
    assert farm_orders[0]["delivery_zone_name"] == "Ado-Ekiti"
    assert farm_orders[0]["payment_status"] == "paid"

    # Verifying again changes nothing.
    assert _pay(m, started["reference"])["status"] == "paid"


def test_checkout_is_all_or_nothing_when_stock_runs_short(market):
    m = market
    yam = _second_product(m, quantity_available="3")
    tomato_stock = get_stock(m["client"], m["tomatoes"]["id"])

    response = _checkout(
        m, [{"product_id": m["tomatoes"]["id"], "quantity": "1"}, {"product_id": yam["id"], "quantity": "5"}]
    )

    assert response.status_code == 409
    assert "Only 3 tuber of White yam left" in response.json()["detail"]
    assert get_stock(m["client"], m["tomatoes"]["id"]) == tomato_stock
    assert m["client"].get("/orders/mine", headers=m["buyer"]).json() == []


def test_checkout_names_items_that_are_no_longer_listed(market):
    m = market
    paused = m["client"].patch(
        f"/products/{m['tomatoes']['id']}", headers=m["farmer"], json={"is_available": False}
    )
    assert paused.status_code == 200, paused.text

    response = _checkout(m, [{"product_id": m["tomatoes"]["id"], "quantity": "1"}])

    assert response.status_code == 409
    assert m["tomatoes"]["name"] in response.json()["detail"]


def test_checkout_validates_input(market):
    m = market
    item = {"product_id": m["tomatoes"]["id"], "quantity": "1"}

    assert _checkout(m, [item, item]).status_code == 422
    assert _checkout(m, []).status_code == 422
    assert _checkout(m, [item], buyer_phone="call me").status_code == 422
    assert _checkout(m, [item], provider="cash").status_code == 422
    farmer_try = m["client"].post(
        "/orders/checkout",
        headers=m["farmer"],
        json={"items": [item], "provider": "paystack", "delivery_zone_id": m["zone"]["id"],
              "buyer_phone": "08031234567", "delivery_address": "Somewhere 12"},
    )
    assert farmer_try.status_code == 403


def test_checkout_needs_an_active_zone_and_an_enabled_provider(market, monkeypatch):
    m = market
    item = {"product_id": m["tomatoes"]["id"], "quantity": "1"}
    stock = get_stock(m["client"], m["tomatoes"]["id"])

    off = m["client"].patch(
        f"/admin/delivery-zones/{m['zone']['id']}", headers=m["admin"], json={"is_active": False}
    )
    assert off.status_code == 200
    assert m["client"].get("/delivery-zones").json() == []
    assert _checkout(m, [item]).status_code == 400

    m["client"].patch(f"/admin/delivery-zones/{m['zone']['id']}", headers=m["admin"], json={"is_active": True})
    monkeypatch.setattr(settings, "interswitch_merchant_code", None)
    assert [p["id"] for p in m["client"].get("/payments/providers").json()] == ["paystack"]
    assert _checkout(m, [item], provider="interswitch").status_code == 400

    # If the provider can't start the payment, nothing is reserved.
    m["providers"].fail_start = True
    failed = _checkout(m, [item])
    assert failed.status_code == 502
    assert "Nothing was charged" in failed.json()["detail"]
    assert get_stock(m["client"], m["tomatoes"]["id"]) == stock


def test_interswitch_returns_a_form_to_post(market):
    m = market
    response = _checkout(m, [{"product_id": m["tomatoes"]["id"], "quantity": "1"}], provider="interswitch")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["redirect_url"] is None
    assert body["form_action"] == "https://isw.test/pay"
    assert body["form_fields"]["txn_ref"] == body["reference"]


def test_failed_payment_releases_stock_and_hides_the_attempt(market):
    m = market
    stock = get_stock(m["client"], m["tomatoes"]["id"])
    reference = _checkout(m, [{"product_id": m["tomatoes"]["id"], "quantity": "4"}]).json()["reference"]
    assert get_stock(m["client"], m["tomatoes"]["id"]) == stock - 4

    m["providers"].results[reference] = "failed"
    result = m["client"].post(f"/payments/{reference}/verify", headers=m["buyer"]).json()

    assert result["status"] == "failed"
    assert get_stock(m["client"], m["tomatoes"]["id"]) == stock
    assert m["client"].get("/orders/mine", headers=m["buyer"]).json() == []


def test_unpaid_checkout_expires_and_late_payment_is_refunded(market):
    m = market
    stock = get_stock(m["client"], m["tomatoes"]["id"])
    reference = _checkout(m, [{"product_id": m["tomatoes"]["id"], "quantity": "3"}]).json()["reference"]

    with m["db"]() as db:
        checkout = db.scalar(select(Checkout).where(Checkout.reference == reference))
        checkout.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()

    # Listing orders sweeps expired checkouts.
    assert m["client"].get("/orders/mine", headers=m["buyer"]).json() == []
    assert get_stock(m["client"], m["tomatoes"]["id"]) == stock
    assert m["client"].get(f"/payments/{reference}", headers=m["buyer"]).json()["status"] == "expired"

    # The buyer paid anyway, after the stock was released: refund it all.
    _pay(m, reference)
    assert m["providers"].refunds == [(reference, "5500.00")]
    assert m["client"].get("/orders/farmer", headers=m["farmer"]).json() == []


def test_declined_and_cancelled_paid_orders_are_refunded(market):
    m = market
    client = m["client"]
    yam = _second_product(m)
    reference = _checkout(
        m, [{"product_id": m["tomatoes"]["id"], "quantity": "2"}, {"product_id": yam["id"], "quantity": "1"}]
    ).json()["reference"]
    _pay(m, reference)
    tomato_order, yam_order = sorted(
        client.get("/orders/farmer", headers=m["farmer"]).json(), key=lambda o: o["product_name"]
    )

    declined = client.patch(
        f"/orders/{tomato_order['id']}/status",
        headers=m["farmer"],
        json={"status": "rejected", "rejection_reason": "Harvest was smaller than expected."},
    )
    assert declined.status_code == 200, declined.text
    assert declined.json()["payment_status"] == "refunded"
    # Only the item is refunded while another item is still going ahead.
    assert m["providers"].refunds == [(reference, "3000.00")]

    cancelled = client.patch(f"/orders/{yam_order['id']}/status", headers=m["buyer"], json={"status": "cancelled"})
    assert cancelled.status_code == 200, cancelled.text
    # Last item: its price plus the delivery fee.
    assert m["providers"].refunds[-1] == (reference, "2500.00")


def test_interswitch_refunds_wait_for_an_admin(market):
    m = market
    client = m["client"]
    reference = _checkout(
        m, [{"product_id": m["tomatoes"]["id"], "quantity": "1"}], provider="interswitch"
    ).json()["reference"]
    _pay(m, reference)
    order = client.get("/orders/farmer", headers=m["farmer"]).json()[0]

    client.patch(
        f"/orders/{order['id']}/status",
        headers=m["farmer"],
        json={"status": "rejected", "rejection_reason": "Sold out at the market."},
    )
    due = client.get("/admin/orders?payment_status=refund_pending", headers=m["admin"]).json()
    assert [o["id"] for o in due] == [order["id"]]

    done = client.patch(f"/admin/orders/{order['id']}/refund-complete", headers=m["admin"])
    assert done.status_code == 200
    assert done.json()["payment_status"] == "refunded"
    again = client.patch(f"/admin/orders/{order['id']}/refund-complete", headers=m["admin"])
    assert again.status_code == 409
    assert client.get("/admin/orders", headers=m["buyer"]).status_code == 403


def test_buyers_cannot_see_each_others_payments(market):
    m = market
    reference = _checkout(m, [{"product_id": m["tomatoes"]["id"], "quantity": "1"}]).json()["reference"]
    other = m["client"].post(
        "/auth/register",
        json={"full_name": "Other Buyer", "email": "other@example.com", "password": "SecurePass123!"},
    )
    assert other.status_code == 201
    headers = login_existing(m["client"], "other@example.com")

    assert m["client"].get(f"/payments/{reference}", headers=headers).status_code == 404
    assert m["client"].post(f"/payments/{reference}/verify", headers=headers).status_code == 404


def test_paystack_webhook_checks_signature_then_confirms(market):
    m = market
    client = m["client"]
    reference = _checkout(m, [{"product_id": m["tomatoes"]["id"], "quantity": "1"}]).json()["reference"]
    body = json.dumps({"event": "charge.success", "data": {"reference": reference}}).encode()

    bad = client.post("/payments/paystack/webhook", content=body, headers={"x-paystack-signature": "nope"})
    assert bad.status_code == 401

    signature = hmac.new(b"sk_test_x", body, hashlib.sha512).hexdigest()
    # A valid event for an unpaid reference doesn't mark it paid on its own.
    ok = client.post("/payments/paystack/webhook", content=body, headers={"x-paystack-signature": signature})
    assert ok.status_code == 200
    assert client.get(f"/payments/{reference}", headers=m["buyer"]).json()["status"] == "awaiting_payment"

    m["providers"].results[reference] = "paid"
    client.post("/payments/paystack/webhook", content=body, headers={"x-paystack-signature": signature})
    assert client.get(f"/payments/{reference}", headers=m["buyer"]).json()["status"] == "paid"


def test_delivery_zone_admin(market):
    m = market
    client = m["client"]
    assert client.post("/admin/delivery-zones", headers=m["buyer"], json={"name": "Ikere", "fee": "1500"}).status_code == 403
    duplicate = client.post("/admin/delivery-zones", headers=m["admin"], json={"name": "Ado-Ekiti", "fee": "5"})
    assert duplicate.status_code == 409
    assert client.post("/admin/delivery-zones", headers=m["admin"], json={"name": "Ikere", "fee": "-1"}).status_code == 422

    created = client.post(
        "/admin/delivery-zones", headers=m["admin"], json={"name": "Ikere-Ekiti", "fee": "1500", "sort_order": 2}
    ).json()
    assert [z["name"] for z in client.get("/delivery-zones").json()] == ["Ado-Ekiti", "Ikere-Ekiti"]
    updated = client.patch(f"/admin/delivery-zones/{created['id']}", headers=m["admin"], json={"fee": "1800"})
    assert updated.json()["fee"] == "1800.00"
    assert client.delete(f"/admin/delivery-zones/{created['id']}", headers=m["admin"]).status_code == 204
    assert len(client.get("/delivery-zones").json()) == 1


def test_single_unpaid_orders_are_off_by_default(market, monkeypatch):
    m = market
    monkeypatch.setattr(settings, "allow_unpaid_orders", False)
    response = m["client"].post(
        "/orders",
        headers=m["buyer"],
        json={"product_id": m["tomatoes"]["id"], "quantity": "1", "delivery_address": "12 Market Road"},
    )
    assert response.status_code == 410

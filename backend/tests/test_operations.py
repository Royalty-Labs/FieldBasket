"""Commission, payouts, delivery dispatch, settings and the admin overview."""

from decimal import Decimal

import pytest

from tests.test_checkout import _checkout, _pay, market, providers  # noqa: F401
from tests.test_farmer_workflow import workflow  # noqa: F401


def _set_commission(m, percent):
    r = m["client"].patch("/admin/settings", headers=m["admin"], json={"commission_percent": percent})
    assert r.status_code == 200, r.text
    return r.json()


def _deliver_one(m, quantity="2"):
    """Buyer pays, farm accepts and marks ready, admin delivers."""
    client = m["client"]
    reference = _checkout(m, [{"product_id": m["tomatoes"]["id"], "quantity": quantity}]).json()["reference"]
    _pay(m, reference)
    order = next(o for o in client.get("/orders/farmer", headers=m["farmer"]).json() if o["status"] == "pending")
    for step in ("accepted", "ready_for_fulfillment"):
        assert client.patch(f"/orders/{order['id']}/status", headers=m["farmer"], json={"status": step}).status_code == 200
    return order


def _bank(m):
    r = m["client"].put(
        "/farmers/me/bank",
        headers=m["farmer"],
        json={"bank_name": "GTBank", "account_number": "0123 456 789", "account_name": "Green Acres Farm"},
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_settings_public_and_admin(market):
    m = market
    client = m["client"]
    assert client.get("/settings/public").json()["service_area"] == "Ekiti State"
    assert "commission_percent" not in client.get("/settings/public").json()
    assert client.patch("/admin/settings", headers=m["buyer"], json={"commission_percent": "5"}).status_code == 403
    assert client.patch("/admin/settings", headers=m["admin"], json={"commission_percent": "80"}).status_code == 422
    assert client.patch("/admin/settings", headers=m["admin"], json={"support_phone": "call me"}).status_code == 422

    saved = client.patch(
        "/admin/settings",
        headers=m["admin"],
        json={"commission_percent": "7.5", "operator_name": "Royalty Labs Ltd", "support_email": "help@example.com",
              "support_phone": "0803 000 1111"},
    ).json()
    assert saved["commission_percent"] == "7.50"
    public = client.get("/settings/public").json()
    assert public["operator_name"] == "Royalty Labs Ltd"
    assert public["support_email"] == "help@example.com"
    # Clearing a contact hides it.
    client.patch("/admin/settings", headers=m["admin"], json={"support_email": ""})
    assert client.get("/settings/public").json()["support_email"] is None


def test_commission_is_fixed_when_the_order_is_placed(market):
    m = market
    _set_commission(m, "10")
    order = _deliver_one(m)  # 2 kg × 1500 = 3000
    _set_commission(m, "20")  # later changes don't touch earlier orders

    farm_view = next(o for o in m["client"].get("/orders/farmer", headers=m["farmer"]).json() if o["id"] == order["id"])
    assert farm_view["commission_percent"] == "10.00"
    assert farm_view["farmer_amount"] == "2700.00"


def test_delivery_steps_and_payout(market):
    m = market
    client = m["client"]
    _set_commission(m, "10")
    order = _deliver_one(m)

    board = client.get("/admin/dispatch", headers=m["admin"]).json()
    assert [o["id"] for o in board] == [order["id"]]
    assert board[0]["farm_phone"] == "08012345678"

    def stage(s):
        return client.patch(f"/admin/orders/{order['id']}/delivery", headers=m["admin"], json={"stage": s})

    assert stage("out_for_delivery").json()["delivery_stage"] == "out_for_delivery"
    assert stage("picked_up").status_code == 409  # can't go back
    done = stage("delivered").json()
    assert done["status"] == "completed"
    assert client.get("/admin/dispatch", headers=m["admin"]).json() == []

    # Owed to the farm, but no bank details yet.
    due = client.get("/admin/payouts/due", headers=m["admin"]).json()
    assert len(due) == 1 and due[0]["amount"] == "2700.00" and due[0]["commission_amount"] == "300.00"
    farmer_id = due[0]["farmer_id"]
    refused = client.post("/admin/payouts", headers=m["admin"], json={"farmer_id": farmer_id, "transfer_reference": "TRF-1"})
    assert refused.status_code == 409

    assert _bank(m)["account_number"] == "0123456789"
    earnings = client.get("/farmers/me/earnings", headers=m["farmer"]).json()
    assert earnings["owed"] == "2700.00" and earnings["has_bank_details"] is True

    paid = client.post("/admin/payouts", headers=m["admin"], json={"farmer_id": farmer_id, "transfer_reference": "TRF-1"})
    assert paid.status_code == 201, paid.text
    assert paid.json()["amount"] == "2700.00" and paid.json()["account_number"] == "0123456789"
    assert client.get("/admin/payouts/due", headers=m["admin"]).json() == []
    again = client.post("/admin/payouts", headers=m["admin"], json={"farmer_id": farmer_id, "transfer_reference": "TRF-2"})
    assert again.status_code == 409

    earnings = client.get("/farmers/me/earnings", headers=m["farmer"]).json()
    assert earnings["owed"] == "0" and earnings["paid_out"] == "2700.00"
    assert len(earnings["payouts"]) == 1


def test_only_ready_orders_can_be_delivered(market):
    m = market
    client = m["client"]
    reference = _checkout(m, [{"product_id": m["tomatoes"]["id"], "quantity": "1"}]).json()["reference"]
    _pay(m, reference)
    order = client.get("/orders/farmer", headers=m["farmer"]).json()[0]
    r = client.patch(f"/admin/orders/{order['id']}/delivery", headers=m["admin"], json={"stage": "delivered"})
    assert r.status_code == 409
    r = client.patch(f"/admin/orders/{order['id']}/delivery", headers=m["buyer"], json={"stage": "delivered"})
    assert r.status_code == 403


@pytest.mark.parametrize("number", ["12345", "01234567890", "ABCDEFGHIJ"])
def test_bank_account_numbers_are_checked(market, number):
    r = market["client"].put(
        "/farmers/me/bank",
        headers=market["farmer"],
        json={"bank_name": "GTBank", "account_number": number, "account_name": "Green Acres"},
    )
    assert r.status_code == 422


def test_overview_counts_money_and_setup(market):
    m = market
    _set_commission(m, "10")
    _deliver_one(m)
    overview = m["client"].get("/admin/overview", headers=m["admin"]).json()
    assert overview["revenue_today"] == "4000.00"  # 3000 produce + 1000 delivery
    assert overview["orders_today"] == 1
    assert overview["ready_for_pickup"] == 1
    assert overview["commission_30_days"] == "300.00"
    assert len(overview["daily"]) == 30 and overview["daily"][-1]["amount"] == "4000.00"
    assert overview["setup"]["payments"] is True
    assert overview["setup"]["delivery_areas"] is True
    assert overview["setup"]["commission"] is True
    assert overview["setup"]["email"] is False
    assert m["client"].get("/admin/overview", headers=m["buyer"]).status_code == 403
    assert Decimal(overview["payouts_owed"]) == 0

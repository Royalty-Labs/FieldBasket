from tests.test_farmer_workflow import product_payload, workflow  # noqa: F401
from tests.test_orders import create_marketplace, get_stock


def _second_product(client, farmer_headers, **overrides):
    response = client.post(
        "/products",
        headers=farmer_headers,
        json=product_payload(name="White yam", unit="tuber", **overrides),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _checkout(client, headers, items, **overrides):
    payload = {
        "items": items,
        "delivery_address": "12 Ajilosun Street, Ado-Ekiti",
        "buyer_note": "Please call on arrival",
    }
    payload.update(overrides)
    return client.post("/orders/checkout", headers=headers, json=payload)


def test_checkout_creates_one_order_per_item_and_reserves_stock(workflow):
    client, session_factory = workflow
    farmer_headers, buyer_headers, tomatoes = create_marketplace(client, session_factory)
    yam = _second_product(client, farmer_headers)
    tomato_stock = get_stock(client, tomatoes["id"])
    yam_stock = get_stock(client, yam["id"])

    response = _checkout(
        client,
        buyer_headers,
        [
            {"product_id": tomatoes["id"], "quantity": "2"},
            {"product_id": yam["id"], "quantity": "1.5"},
        ],
    )

    assert response.status_code == 201, response.text
    orders = response.json()
    assert [o["product_name"] for o in orders] == [tomatoes["name"], "White yam"]
    assert all(o["status"] == "pending" for o in orders)
    assert all(o["buyer_note"] == "Please call on arrival" for o in orders)
    assert get_stock(client, tomatoes["id"]) == tomato_stock - 2
    assert get_stock(client, yam["id"]) == yam_stock - 1.5

    farmer_orders = client.get("/orders/farmer", headers=farmer_headers).json()
    assert len(farmer_orders) == 2


def test_checkout_is_all_or_nothing_when_stock_runs_short(workflow):
    client, session_factory = workflow
    farmer_headers, buyer_headers, tomatoes = create_marketplace(client, session_factory)
    yam = _second_product(client, farmer_headers, quantity_available="3")
    tomato_stock = get_stock(client, tomatoes["id"])

    response = _checkout(
        client,
        buyer_headers,
        [
            {"product_id": tomatoes["id"], "quantity": "1"},
            {"product_id": yam["id"], "quantity": "5"},
        ],
    )

    assert response.status_code == 409
    assert "Only 3 tuber of White yam left" in response.json()["detail"]
    # The first item's stock was not kept reserved.
    assert get_stock(client, tomatoes["id"]) == tomato_stock
    assert client.get("/orders/mine", headers=buyer_headers).json() == []


def test_checkout_names_items_that_are_no_longer_listed(workflow):
    client, session_factory = workflow
    farmer_headers, buyer_headers, tomatoes = create_marketplace(client, session_factory)
    paused = client.patch(
        f"/products/{tomatoes['id']}", headers=farmer_headers, json={"is_available": False}
    )
    assert paused.status_code == 200, paused.text

    response = _checkout(client, buyer_headers, [{"product_id": tomatoes["id"], "quantity": "1"}])

    assert response.status_code == 409
    assert tomatoes["name"] in response.json()["detail"]


def test_checkout_rejects_duplicate_items_and_non_buyers(workflow):
    client, session_factory = workflow
    farmer_headers, buyer_headers, tomatoes = create_marketplace(client, session_factory)
    item = {"product_id": tomatoes["id"], "quantity": "1"}

    assert _checkout(client, buyer_headers, [item, item]).status_code == 422
    assert _checkout(client, buyer_headers, []).status_code == 422
    assert _checkout(client, farmer_headers, [item]).status_code == 403

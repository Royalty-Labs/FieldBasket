from io import BytesIO

from PIL import Image

from app.api.routes.products import escape_like, strip_image_metadata
from tests.test_farmer_workflow import (
    approve_profile_for_products,
    create_admin,
    create_profile,
    login_existing,
    register_and_login,
    workflow,  # noqa: F401  (pytest fixture)
)
from tests.test_orders import create_marketplace


def _approved_farmer(client, session_factory):
    farmer_headers = register_and_login(client, "verified-farmer@example.com", "farmer")
    profile = create_profile(client, farmer_headers)
    assert profile.status_code == 201, profile.text
    create_admin(session_factory)
    admin_headers = login_existing(client, "admin@example.com")
    approve_profile_for_products(client, admin_headers, profile.json()["id"])
    return farmer_headers


def test_repeated_failed_logins_are_blocked(workflow):
    client, _ = workflow
    register_and_login(client, "guess@example.com", "buyer")

    for _ in range(5):
        response = client.post(
            "/auth/login", json={"email": "guess@example.com", "password": "WrongPass123!"}
        )
        assert response.status_code == 401

    blocked = client.post(
        "/auth/login", json={"email": "guess@example.com", "password": "WrongPass123!"}
    )
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0

    # Even the right password waits until the window passes.
    login_with_real_password = client.post(
        "/auth/login", json={"email": "GUESS@example.com", "password": "SecurePass123!"}
    )
    assert login_with_real_password.status_code == 429


def test_unknown_email_gets_the_same_error_as_a_wrong_password(workflow):
    client, _ = workflow
    response = client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": "Whatever123!"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


def test_approval_marks_the_farmer_account_verified(workflow):
    client, session_factory = workflow
    farmer_headers = _approved_farmer(client, session_factory)

    me = client.get("/auth/me", headers=farmer_headers)
    assert me.json()["is_verified"] is True


def test_changing_checked_details_sends_a_verified_farm_back_for_review(workflow):
    client, session_factory = workflow
    farmer_headers = _approved_farmer(client, session_factory)

    changed = client.patch(
        "/farmers/me/profile", headers=farmer_headers, json={"phone": "08099999999"}
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["verification_status"] == "pending"
    assert client.get("/auth/me", headers=farmer_headers).json()["is_verified"] is False


def test_same_details_keep_a_verified_farm_verified(workflow):
    client, session_factory = workflow
    farmer_headers = _approved_farmer(client, session_factory)
    profile = client.get("/farmers/me/profile", headers=farmer_headers).json()

    response = client.patch(
        "/farmers/me/profile",
        headers=farmer_headers,
        json={"farm_name": profile["farm_name"], "phone": profile["phone"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["verification_status"] == "approved"


def test_search_wildcards_are_treated_as_text(workflow):
    client, session_factory = workflow
    create_marketplace(client, session_factory)

    assert client.get("/products", params={"search": "%"}).json() == []
    assert client.get("/products", params={"search": "_"}).json() == []
    assert escape_like("50%_off\\") == "50\\%\\_off\\\\"


def test_photo_metadata_is_removed_and_orientation_kept():
    image = Image.new("RGB", (40, 20), "red")
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation: rotate 90° clockwise to display
    exif[0x010F] = "PhoneMaker"  # Camera make
    buffer = BytesIO()
    image.save(buffer, format="JPEG", exif=exif)

    cleaned = Image.open(BytesIO(strip_image_metadata(buffer.getvalue())))

    assert cleaned.format == "JPEG"
    assert dict(cleaned.getexif()) == {}
    assert cleaned.size == (20, 40)

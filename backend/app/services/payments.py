"""Paystack and Interswitch, behind one small interface.

The server never trusts the browser about payment: every checkout is
confirmed by asking the provider directly, and the amount must match.
"""

import hashlib
import hmac
import logging
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

import httpx

from app.core.config import settings
from app.models import Checkout

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(20.0)

INTERSWITCH_URLS = {
    "test": (
        "https://newwebpay-sandbox.interswitchng.com/collections/w/pay",
        "https://sandbox.interswitchng.com/collections/api/v1/gettransaction",
    ),
    "live": (
        "https://newwebpay.interswitchng.com/collections/w/pay",
        "https://webpay.interswitchng.com/collections/api/v1/gettransaction",
    ),
}

PROVIDER_LABELS = {"paystack": "Paystack", "interswitch": "Interswitch"}


class PaymentError(Exception):
    """The provider could not be reached or refused the request."""


@dataclass
class PaymentStart:
    redirect_url: str | None = None
    form_action: str | None = None
    form_fields: dict[str, str] = field(default_factory=dict)


@dataclass
class PaymentCheck:
    status: Literal["paid", "failed", "pending"]
    provider_reference: str | None = None


def to_kobo(amount: Decimal) -> int:
    return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def enabled_providers() -> list[str]:
    providers = []
    if settings.paystack_secret_key:
        providers.append("paystack")
    if settings.interswitch_merchant_code and settings.interswitch_pay_item_id:
        providers.append("interswitch")
    return providers


def return_url(checkout: Checkout) -> str:
    return f"{settings.frontend_base}/payment/return?reference={checkout.reference}"


def _interswitch_urls() -> tuple[str, str]:
    pay_url, requery_url = INTERSWITCH_URLS.get(settings.interswitch_mode, INTERSWITCH_URLS["test"])
    return (
        settings.interswitch_pay_url or pay_url,
        settings.interswitch_requery_url or requery_url,
    )


def _paystack_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.paystack_secret_key}"}


def start_payment(checkout: Checkout, email: str, name: str) -> PaymentStart:
    """Create the payment with the provider and say where to send the buyer."""
    amount = to_kobo(checkout.amount_total)

    if checkout.provider == "paystack":
        try:
            response = httpx.post(
                f"{settings.paystack_base_url}/transaction/initialize",
                headers=_paystack_headers(),
                json={
                    "email": email,
                    "amount": str(amount),
                    "currency": "NGN",
                    "reference": checkout.reference,
                    "callback_url": return_url(checkout),
                    "metadata": {
                        "checkout_id": str(checkout.id),
                        "cancel_action": f"{settings.frontend_base}/basket",
                    },
                },
                timeout=TIMEOUT,
            )
            body = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise PaymentError("Paystack could not be reached.") from error

        if not response.is_success or not body.get("status"):
            logger.warning("Paystack initialize failed: %s", body.get("message"))
            raise PaymentError("Paystack could not start this payment.")
        return PaymentStart(redirect_url=body["data"]["authorization_url"])

    if checkout.provider == "interswitch":
        pay_url, _ = _interswitch_urls()
        return PaymentStart(
            form_action=pay_url,
            form_fields={
                "merchant_code": settings.interswitch_merchant_code or "",
                "pay_item_id": settings.interswitch_pay_item_id or "",
                "pay_item_name": "FieldBasket order",
                "txn_ref": checkout.reference,
                "amount": str(amount),
                "currency": "566",
                "cust_email": email,
                "cust_name": name,
                "site_redirect_url": return_url(checkout),
                "payment_response_type": "GET",
            },
        )

    raise PaymentError("Unknown payment provider.")


def check_payment(checkout: Checkout) -> PaymentCheck:
    """Ask the provider whether this checkout was paid in full."""
    amount = to_kobo(checkout.amount_total)

    if checkout.provider == "paystack":
        try:
            response = httpx.get(
                f"{settings.paystack_base_url}/transaction/verify/{checkout.reference}",
                headers=_paystack_headers(),
                timeout=TIMEOUT,
            )
            body = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise PaymentError("Paystack could not be reached.") from error

        data = body.get("data") or {}
        state = data.get("status")
        if state == "success":
            if int(data.get("amount", -1)) == amount and data.get("currency", "NGN") == "NGN":
                return PaymentCheck("paid", str(data.get("id") or data.get("reference") or ""))
            logger.error("Paystack amount mismatch for %s", checkout.reference)
            return PaymentCheck("failed")
        if state in {"failed", "reversed"}:
            return PaymentCheck("failed")
        return PaymentCheck("pending")

    if checkout.provider == "interswitch":
        _, requery_url = _interswitch_urls()
        try:
            response = httpx.get(
                requery_url,
                params={
                    "merchantcode": settings.interswitch_merchant_code,
                    "transactionreference": checkout.reference,
                    "amount": amount,
                },
                headers={"Content-Type": "application/json"},
                timeout=TIMEOUT,
            )
            body = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise PaymentError("Interswitch could not be reached.") from error

        if body.get("ResponseCode") == "00":
            if int(body.get("Amount", -1)) == amount:
                return PaymentCheck("paid", str(body.get("PaymentReference") or ""))
            logger.error("Interswitch amount mismatch for %s", checkout.reference)
            return PaymentCheck("failed")
        # Other codes can mean "not finished yet"; the checkout expires
        # (and releases its stock) if it never completes.
        return PaymentCheck("pending")

    raise PaymentError("Unknown payment provider.")


def refund(checkout: Checkout, amount: Decimal) -> bool:
    """Return money to the buyer. False means an admin must refund it.

    Paystack refunds through its API. Interswitch refunds are made by an
    admin in the Interswitch console, so they are flagged instead.
    """
    if checkout.provider != "paystack" or not settings.paystack_secret_key:
        return False
    try:
        response = httpx.post(
            f"{settings.paystack_base_url}/refund",
            headers=_paystack_headers(),
            json={"transaction": checkout.reference, "amount": str(to_kobo(amount))},
            timeout=TIMEOUT,
        )
        body = response.json()
    except (httpx.HTTPError, ValueError):
        logger.exception("Paystack refund request failed for %s", checkout.reference)
        return False
    if not response.is_success or not body.get("status"):
        logger.warning("Paystack refund refused for %s: %s", checkout.reference, body.get("message"))
        return False
    return True


def paystack_signature_valid(raw_body: bytes, signature: str | None) -> bool:
    if not settings.paystack_secret_key or not signature:
        return False
    expected = hmac.new(settings.paystack_secret_key.encode(), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)

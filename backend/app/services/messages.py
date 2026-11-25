"""The words in every FieldBasket email, in one place."""

from decimal import Decimal

from app.core.config import settings
from app.services.email import Email


def naira(value: Decimal) -> str:
    amount = Decimal(value).quantize(Decimal("0.01"))
    text = f"{amount:,.2f}"
    return "₦" + (text[:-3] if text.endswith(".00") else text)


def qty(value: Decimal, unit: str) -> str:
    return f"{Decimal(value).normalize():f} {unit}"


def url(path: str) -> str:
    return f"{settings.frontend_base}{path}"


def farmer_new_orders(to: str, farmer_name: str, items: list[tuple[str, Decimal, str, Decimal]],
                      buyer_name: str, buyer_phone: str, zone: str, address: str, note: str | None) -> Email:
    lines = [f"Hello {farmer_name},", "You have a new paid order on FieldBasket:"]
    lines += [f"• {name}: {qty(q, unit)} ({naira(total)})" for name, q, unit, total in items]
    lines += [
        f"Buyer: {buyer_name}, {buyer_phone}",
        f"Delivery area: {zone}. Address: {address}",
    ]
    if note:
        lines.append(f"Buyer's note: {note}")
    lines.append("Please accept or decline it soon. The buyer has already paid.")
    count = len(items)
    return Email(
        to=to,
        subject=f"New paid order: {items[0][0]}" + (f" and {count - 1} more" if count > 1 else ""),
        lines=lines,
        action_label="Open your orders",
        action_url=url("/farm/orders"),
    )


def buyer_receipt(to: str, buyer_name: str, reference: str, items: list[tuple[str, Decimal, str, Decimal, str]],
                  items_total: Decimal, delivery_fee: Decimal, total: Decimal, zone: str, address: str) -> Email:
    lines = [f"Hello {buyer_name},", f"Thank you. Your payment for order {reference} was successful."]
    lines += [f"• {name} ({farm}): {qty(q, unit)}, {naira(line_total)}" for name, q, unit, line_total, farm in items]
    lines += [
        f"Produce: {naira(items_total)}. Delivery to {zone}: {naira(delivery_fee)}. Total paid: {naira(total)}.",
        f"Delivery address: {address}",
        "Each farm will now confirm its part. If a farm can't supply an item, that part is refunded to you.",
    ]
    return Email(to=to, subject=f"Payment received for order {reference}", lines=lines,
                 action_label="Follow your order", action_url=url("/orders"))


def buyer_order_update(to: str, buyer_name: str, product: str, amount: str, farm: str, status: str,
                       reason: str | None = None, refund_note: str | None = None) -> Email:
    if status == "accepted":
        subject = f"{farm} accepted your order"
        body = f"{farm} accepted your order for {product} ({amount}). We'll let you know when it's ready."
    elif status == "ready_for_fulfillment":
        subject = f"Your {product} is ready for delivery"
        body = f"{farm} has packed your {product} ({amount}). It's ready to be delivered to you."
    else:
        subject = f"{farm} couldn't supply your {product}"
        body = f"{farm} declined your order for {product} ({amount})." + (f" Reason: {reason}" if reason else "")
    lines = [f"Hello {buyer_name},", body]
    if refund_note:
        lines.append(refund_note)
    return Email(to=to, subject=subject, lines=lines, action_label="View your orders", action_url=url("/orders"))


def farmer_order_closed(to: str, farmer_name: str, product: str, amount: str, buyer_name: str, status: str) -> Email:
    if status == "cancelled":
        subject = f"Order cancelled: {product}"
        body = f"{buyer_name} cancelled their order for {product} ({amount}). The stock is back in your listing."
    else:
        subject = f"Delivered: {product}"
        body = f"{buyer_name} confirmed they received {product} ({amount}). Thank you!"
    return Email(to=to, subject=subject, lines=[f"Hello {farmer_name},", body],
                 action_label="Open your orders", action_url=url("/farm/orders"))


def refund_note(refunded: bool, amount: Decimal) -> str:
    if refunded:
        return f"We've refunded {naira(amount)} to your payment method. Banks usually show it within a few working days."
    return f"A refund of {naira(amount)} is being arranged and will reach you within a few working days."


def admin_new_application(to: str, farm_name: str, owner: str, town: str, phone: str) -> Email:
    return Email(
        to=to,
        subject=f"New farm to verify: {farm_name}",
        lines=[f"{owner} applied to sell as {farm_name} ({town}). Phone: {phone}.",
               "Please review the details and call the farmer before approving."],
        action_label="Review applications",
        action_url=url("/admin"),
    )


def farmer_review_result(to: str, farmer_name: str, farm_name: str, approved: bool, reason: str | None) -> Email:
    if approved:
        return Email(to=to, subject=f"{farm_name} is verified on FieldBasket",
                     lines=[f"Hello {farmer_name},", f"Good news: {farm_name} is verified. You can now list produce and receive orders."],
                     action_label="Add your first listing", action_url=url("/farm/listings/new"))
    return Email(to=to, subject=f"{farm_name} needs a few changes",
                 lines=[f"Hello {farmer_name},", f"We couldn't verify {farm_name} yet. Reason: {reason}",
                        "Update your farm details and save them to send them for review again."],
                 action_label="Update your farm", action_url=url("/farm/profile"))


def password_reset(to: str, name: str, link: str) -> Email:
    return Email(
        to=to,
        subject="Reset your FieldBasket password",
        lines=[f"Hello {name},", "Someone asked to reset the password for your FieldBasket account.",
               "This link works once and expires in one hour. If it wasn't you, you can ignore this email."],
        action_label="Choose a new password",
        action_url=link,
    )

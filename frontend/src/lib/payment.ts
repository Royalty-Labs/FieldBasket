import type { CheckoutStart } from "../types";

const PENDING_KEY = "fieldbasket:pending-payment";
const DETAILS_KEY = "fieldbasket:delivery-details";

/** Send the buyer to Paystack (a link) or Interswitch (a posted form). */
export function goToPayment(start: CheckoutStart) {
  try {
    sessionStorage.setItem(PENDING_KEY, start.reference);
  } catch {
    /* private mode: the return URL still carries the reference */
  }
  if (start.redirect_url) {
    window.location.assign(start.redirect_url);
    return;
  }
  if (start.form_action) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = start.form_action;
    for (const [name, value] of Object.entries(start.form_fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }
}

export function pendingReference(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearPendingReference() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export type DeliveryDetails = { phone: string; address: string; zoneId: string };

/** Remember a buyer's delivery details on this device for next time. */
export function savedDeliveryDetails(userId: string): Partial<DeliveryDetails> {
  try {
    return JSON.parse(localStorage.getItem(`${DETAILS_KEY}:${userId}`) ?? "{}");
  } catch {
    return {};
  }
}

export function saveDeliveryDetails(userId: string, details: DeliveryDetails) {
  try {
    localStorage.setItem(`${DETAILS_KEY}:${userId}`, JSON.stringify(details));
  } catch {
    /* ignore */
  }
}

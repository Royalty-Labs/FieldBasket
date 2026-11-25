import { useState } from "react";
import * as api from "../api/endpoints";
import { naira, orderRef, quantity, timeAgo } from "../lib/format";
import { errorMessage } from "../lib/useApi";
import type { Order } from "../types";
import { Notice } from "./Feedback";
import { PaymentBadge, StatusText } from "./OrderParts";

/** One incoming order with the actions the farmer can take next. */
export function FarmerOrderCard({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(status: "accepted" | "rejected" | "ready_for_fulfillment") {
    setBusy(true);
    setError(null);
    try {
      await api.updateOrderStatus(order.id, status, reason.trim());
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <article className="card">
      <div className="card__head">
        <div>
          <h3 className="card__title">
            {order.product_name} · {quantity(order.quantity)} {order.unit}
          </h3>
          <p className="card__sub">
            {order.buyer_name ?? "Buyer"}
            {order.buyer_phone && (
              <>
                {" · "}
                <a href={`tel:${order.buyer_phone.replace(/[^+\d]/g, "")}`}>{order.buyer_phone}</a>
              </>
            )}
          </p>
          <p className="card__sub">
            {order.delivery_zone_name ? `${order.delivery_zone_name}: ` : ""}
            {order.delivery_address}
          </p>
        </div>
        <div className="card__aside">
          <span className="card__amount">{naira(order.total_price)}</span>
          <PaymentBadge order={order} />
          <span className="card__sub">{timeAgo(order.created_at)}</span>
        </div>
      </div>

      {order.buyer_note && <p className="card__note">“{order.buyer_note}”</p>}
      {error && <Notice tone="error">{error}</Notice>}

      {order.status === "pending" && !declining && (
        <div className="card__foot card__foot--grid">
          <button className="btn btn--outline" disabled={busy} onClick={() => setDeclining(true)}>
            Decline
          </button>
          <button className="btn btn--ink" disabled={busy} onClick={() => move("accepted")}>
            Accept
          </button>
        </div>
      )}

      {order.status === "pending" && declining && (
        <div className="card__foot card__foot--stack">
          <label htmlFor={`reason-${order.id}`} className="field__label">
            Reason the buyer will see
          </label>
          {order.payment_status === "paid" && (
            <p className="field__hint">The buyer has paid, so declining refunds them for this item.</p>
          )}
          <textarea
            id={`reason-${order.id}`}
            className="input input--area"
            rows={2}
            placeholder="e.g. Sold out at the market this morning"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="card__foot--grid">
            <button className="btn btn--outline" disabled={busy} onClick={() => setDeclining(false)}>
              Back
            </button>
            <button className="btn btn--danger" disabled={busy || !reason.trim()} onClick={() => move("rejected")}>
              Decline order
            </button>
          </div>
        </div>
      )}

      {order.status === "accepted" && (
        <div className="card__foot">
          <button className="btn btn--ink btn--block" disabled={busy} onClick={() => move("ready_for_fulfillment")}>
            Mark as ready
          </button>
        </div>
      )}

      {!["pending", "accepted"].includes(order.status) && (
        <div className="card__foot card__foot--split">
          <StatusText order={order} />
          <span className="card__sub">{orderRef(order.id)}</span>
        </div>
      )}
    </article>
  );
}

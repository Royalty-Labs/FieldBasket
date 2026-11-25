import type { Order } from "../types";
import { dateTime, ORDER_STATUS_LABEL } from "../lib/format";

const STEPS: { label: string; reached: (order: Order) => boolean }[] = [
  { label: "Order placed", reached: () => true },
  { label: "Accepted by the farm", reached: (o) => ["accepted", "ready_for_fulfillment", "completed"].includes(o.status) },
  { label: "Ready for delivery", reached: (o) => ["ready_for_fulfillment", "completed"].includes(o.status) },
  {
    label: "On the way",
    reached: (o) => o.status === "completed" || o.delivery_stage === "out_for_delivery" || o.delivery_stage === "picked_up",
  },
  { label: "Delivered", reached: (o) => o.status === "completed" },
];

/** Step-by-step progress for an order that is still moving. */
export function OrderTimeline({ order }: { order: Order }) {
  const reached = STEPS.map((step) => step.reached(order));
  const current = reached.lastIndexOf(true);

  return (
    <ol className="timeline">
      {STEPS.map((step, index) => (
        <li
          key={step.label}
          className={`timeline__step${reached[index] ? " is-done" : ""}${index === current ? " is-current" : ""}`}
        >
          <span className="timeline__marker" aria-hidden="true" />
          <span className="timeline__text">
            <span className="timeline__label">{step.label}</span>
            {index === 0 && <span className="timeline__time">{dateTime(order.created_at)}</span>}
            {index === current && index > 0 && (
              <span className="timeline__time">{dateTime(order.updated_at)}</span>
            )}
            {index === STEPS.length - 1 && !reached[index] && order.status === "ready_for_fulfillment" && (
              <span className="timeline__time">Confirm when it arrives</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function StatusText({ order }: { order: Order }) {
  return (
    <span className={`status status--${order.status}`}>
      <span className="status__dot" aria-hidden="true" />
      {ORDER_STATUS_LABEL[order.status]}
    </span>
  );
}

const PAYMENT_TEXT: Partial<Record<Order["payment_status"], { label: string; tone: string }>> = {
  awaiting: { label: "Payment not finished", tone: "pending" },
  paid: { label: "Paid", tone: "completed" },
  refund_pending: { label: "Refund on the way", tone: "accepted" },
  refunded: { label: "Refunded", tone: "cancelled" },
};

/** Paid / refund state, for orders placed through online checkout. */
export function PaymentBadge({ order }: { order: Order }) {
  const text = PAYMENT_TEXT[order.payment_status];
  if (!text) return null;
  return <span className={`pay-badge pay-badge--${text.tone}`}>{text.label}</span>;
}

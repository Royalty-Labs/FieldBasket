import { useCallback, useState } from "react";
import { Link, useLocation } from "react-router";
import * as api from "../../api/endpoints";
import { EmptyState, Notice, PageLoader } from "../../components/Feedback";
import { OrderTimeline, PaymentBadge, StatusText } from "../../components/OrderParts";
import { ACTIVE_ORDER_STATUSES, naira, orderRef, quantity, shortDate } from "../../lib/format";
import { errorMessage, useApi } from "../../lib/useApi";
import type { Order } from "../../types";

export default function Orders() {
  const location = useLocation();
  const placed = (location.state as { placed?: number | boolean } | null)?.placed;
  const [tab, setTab] = useState<"active" | "past">("active");
  const load = useCallback(() => api.listMyOrders(), []);
  const { data: orders, error, loading, reload } = useApi(load);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const unpaid = orders?.filter((o) => o.payment_status === "awaiting") ?? [];
  const unpaidRefs = [...new Set(unpaid.map((o) => o.checkout_reference).filter(Boolean))] as string[];
  const active =
    orders?.filter((o) => o.payment_status !== "awaiting" && ACTIVE_ORDER_STATUSES.includes(o.status)) ?? [];
  const past = orders?.filter((o) => !ACTIVE_ORDER_STATUSES.includes(o.status)) ?? [];

  async function act(order: Order, status: "cancelled" | "completed") {
    const refundNote = order.payment_status === "paid" ? " You'll be refunded for it." : "";
    if (status === "cancelled" && !window.confirm(`Cancel your order for ${order.product_name}?${refundNote}`)) return;
    setBusyId(order.id);
    setActionError(null);
    try {
      await api.updateOrderStatus(order.id, status);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
      <div className="container container--narrow page-pad">
      <header className="page-head">
        <h1 className="display-2">Orders</h1>
        <div className="segmented page-head__tabs" role="tablist" aria-label="Order filter">
          <button role="tab" aria-selected={tab === "active"} className={`segmented__option${tab === "active" ? " is-active" : ""}`} onClick={() => setTab("active")}>
            In progress{active.length ? ` · ${active.length}` : ""}
          </button>
          <button role="tab" aria-selected={tab === "past"} className={`segmented__option${tab === "past" ? " is-active" : ""}`} onClick={() => setTab("past")}>
            Past
          </button>
        </div>
      </header>

      <div className="stack-lg">
        {placed && (
          <Notice tone="success">
            {typeof placed === "number" && placed > 1
              ? `Your basket was sent as ${placed} orders. Each farm will confirm its part shortly.`
              : "Order placed. The farm will confirm it shortly."}
          </Notice>
        )}
        {(error || actionError) && <Notice tone="error">{error ?? actionError}</Notice>}
        {unpaidRefs.map((ref) => (
          <Notice key={ref} tone="warning">
            Payment for order {ref} isn't finished yet. Its items are held for a short while.{" "}
            <Link to={`/payment/return?reference=${encodeURIComponent(ref)}`}>Check payment</Link>
          </Notice>
        ))}

        {loading && !orders ? (
          <PageLoader label="Loading orders" />
        ) : tab === "active" ? (
          active.length === 0 ? (
            <EmptyState
              title="No orders in progress"
              body="When you order from a farm, you can follow it here."
              action={<Link to="/shop" className="btn btn--ink">Browse produce</Link>}
            />
          ) : (
            <div className="stack">
              {active.map((order) => (
                <article key={order.id} className="card">
                  <div className="card__head">
                    <div>
                      <h2 className="card__title">
                        {order.product_name} · {quantity(order.quantity)} {order.unit}
                      </h2>
                      <p className="card__sub">
                        {order.farm_name ?? "Farm"} · {orderRef(order.id)}
                      </p>
                    </div>
                    <div className="card__aside">
                      <span className="card__amount">{naira(order.total_price)}</span>
                      <PaymentBadge order={order} />
                    </div>
                  </div>
                  <div className="card__body">
                    <OrderTimeline order={order} />
                  </div>
                  {order.status === "ready_for_fulfillment" && (
                    <div className="card__foot">
                      <button className="btn btn--ink btn--block" disabled={busyId === order.id} onClick={() => act(order, "completed")}>
                        I've received this order
                      </button>
                    </div>
                  )}
                  {order.status === "pending" && (
                    <div className="card__foot card__foot--split">
                      <StatusText order={order} />
                      <button className="btn btn--text-danger" disabled={busyId === order.id} onClick={() => act(order, "cancelled")}>
                        Cancel
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )
        ) : past.length === 0 ? (
          <EmptyState title="No past orders yet" />
        ) : (
          <ul className="rows">
            {past.map((order) => (
              <li key={order.id} className="row row--static">
                <span className="row__main">
                  <span className="row__title">
                    {order.product_name} · {quantity(order.quantity)} {order.unit}
                  </span>
                  <span className="row__sub">
                    {order.farm_name ?? "Farm"} · {shortDate(order.created_at)}
                  </span>
                  {order.status === "rejected" && order.rejection_reason && (
                    <span className="row__sub">Reason: {order.rejection_reason}</span>
                  )}
                </span>
                <span className="row__end">
                  <span className="row__title">{naira(order.total_price)}</span>
                  <StatusText order={order} />
                  {(order.payment_status === "refunded" || order.payment_status === "refund_pending") && (
                    <PaymentBadge order={order} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

import { useCallback, useState } from "react";
import * as api from "../../api/endpoints";
import { EmptyState, Notice, PageLoader } from "../../components/Feedback";
import { PaymentBadge, StatusText } from "../../components/OrderParts";
import { naira, quantity, shortDate } from "../../lib/format";
import { errorMessage, useApi } from "../../lib/useApi";
import type { Order } from "../../types";

type Filter = "refund_pending" | "paid" | "refunded" | "all";

const TABS: { key: Filter; label: string }[] = [
  { key: "refund_pending", label: "Refunds due" },
  { key: "paid", label: "Paid" },
  { key: "refunded", label: "Refunded" },
  { key: "all", label: "All" },
];

export default function AdminOrders() {
  const [tab, setTab] = useState<Filter>("refund_pending");
  const load = useCallback(() => api.listAdminOrders(), []);
  const { data, error, loading, reload } = useApi(load);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const all = data ?? [];
  const rows = tab === "all" ? all : all.filter((o) => o.payment_status === tab);
  const count = (f: Filter) => (f === "all" ? all.length : all.filter((o) => o.payment_status === f).length);

  async function markRefunded(order: Order) {
    const ok = window.confirm(
      `Mark ${order.product_name} for ${order.buyer_name ?? "the buyer"} as refunded? Do this only after the money has been sent back.`,
    );
    if (!ok) return;
    setBusyId(order.id);
    setActionError(null);
    try {
      await api.markRefunded(order.id);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="admin__top">
        <h1 className="admin__title">Orders &amp; refunds</h1>
      </div>
      <p className="admin__lead">
        Paystack refunds go back automatically. Interswitch refunds, and any automatic refund that failed, wait here:
        send the money back from the provider's dashboard, then mark it refunded.
      </p>

      <div className="tabs tabs--light" role="tablist" aria-label="Payment filter">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`tabs__tab${tab === t.key ? " is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} · {count(t.key)}
          </button>
        ))}
      </div>

      {(error || actionError) && <Notice tone="error">{error ?? actionError}</Notice>}

      {loading && !data ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <EmptyState title={tab === "refund_pending" ? "No refunds waiting" : "No orders in this list"} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Buyer</th>
                <th scope="col">Farm</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr key={order.id}>
                  <td>
                    <span className="table__strong">
                      {order.product_name} · {quantity(order.quantity)} {order.unit}
                    </span>
                    <span className="table__sub">
                      {order.checkout_reference ?? "Before online payment"} · {shortDate(order.created_at)}
                    </span>
                  </td>
                  <td>
                    {order.buyer_name ?? "Buyer"}
                    {order.buyer_phone && <span className="table__sub">{order.buyer_phone}</span>}
                  </td>
                  <td>
                    {order.farm_name ?? "Farm"}
                    {order.delivery_zone_name && <span className="table__sub">To {order.delivery_zone_name}</span>}
                  </td>
                  <td className="table__strong">{naira(order.total_price)}</td>
                  <td>
                    <StatusText order={order} />
                    <PaymentBadge order={order} />
                  </td>
                  <td className="table__actions">
                    {order.payment_status === "refund_pending" && (
                      <button className="btn btn--ink btn--sm" disabled={busyId === order.id} onClick={() => markRefunded(order)}>
                        Mark refunded
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

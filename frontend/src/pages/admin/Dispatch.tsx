import { useCallback, useState } from "react";
import * as api from "../../api/endpoints";
import { EmptyState, Notice, PageLoader } from "../../components/Feedback";
import { Icon } from "../../components/Icon";
import { quantity, shortDate } from "../../lib/format";
import { errorMessage, useApi } from "../../lib/useApi";
import { telLink } from "../../settings/siteSettings";
import type { Order } from "../../types";

type Stage = "picked_up" | "out_for_delivery" | "delivered";

const STAGE_TEXT: Record<string, string> = {
  preparing: "Farm preparing",
  ready: "Ready for pickup",
  picked_up: "Picked up",
  out_for_delivery: "On the way",
};

function stageOf(order: Order) {
  if (order.status === "accepted") return "preparing";
  return order.delivery_stage ?? "ready";
}

function NEXT(order: Order): { stage: Stage; label: string }[] {
  const s = stageOf(order);
  if (s === "ready") return [{ stage: "picked_up", label: "Picked up" }, { stage: "delivered", label: "Delivered" }];
  if (s === "picked_up") return [{ stage: "out_for_delivery", label: "On the way" }, { stage: "delivered", label: "Delivered" }];
  if (s === "out_for_delivery") return [{ stage: "delivered", label: "Delivered" }];
  return [];
}

function Phone({ number }: { number: string | null }) {
  return number ? <a href={telLink(number)}>{number}</a> : <span className="muted">No phone</span>;
}

export default function Dispatch() {
  const load = useCallback(() => api.listDispatch(), []);
  const { data, error, loading, reload } = useApi(load);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [today] = useState(() => new Date().toISOString());

  async function move(order: Order, stage: Stage) {
    if (stage === "delivered" && !window.confirm(`Mark ${order.product_name} for ${order.buyer_name ?? "the buyer"} as delivered?`)) return;
    setBusyId(order.id);
    setActionError(null);
    try {
      await api.setDeliveryStage(order.id, stage);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const orders = data ?? [];
  const areas = new Map<string, Order[]>();
  for (const order of orders) {
    const area = order.delivery_zone_name ?? "No delivery area";
    areas.set(area, [...(areas.get(area) ?? []), order]);
  }
  const ready = orders.filter((o) => o.status === "ready_for_fulfillment").length;

  return (
    <>
      <div className="admin__top">
        <h1 className="admin__title">Dispatch</h1>
        {orders.length > 0 && (
          <button className="btn btn--outline btn--sm no-print" onClick={() => window.print()}>
            <Icon name="receipt" size={16} /> Print delivery sheet
          </button>
        )}
      </div>
      <p className="admin__lead no-print">
        Paid orders the farms are preparing or have ready, grouped by delivery area. Mark each step as the rider
        goes; buyers get an email when their order is on the way, and "Delivered" completes the order.
      </p>
      <p className="print-only dispatch__printed">
        FieldBasket delivery sheet · {shortDate(today)} · {ready} ready for pickup
      </p>

      {(error || actionError) && <Notice tone="error">{error ?? actionError}</Notice>}
      {loading && !data ? (
        <PageLoader />
      ) : orders.length === 0 ? (
        <EmptyState title="Nothing to deliver right now" body="Orders appear here once a farm accepts them." />
      ) : (
        [...areas.entries()].map(([area, list]) => (
          <section key={area} className="dispatch" aria-label={area}>
            <h2 className="dispatch__area">
              {area} <span className="dispatch__count">{list.length}</span>
            </h2>
            <ul className="dispatch__list">
              {list.map((order) => {
                const stage = stageOf(order);
                return (
                  <li key={order.id} className={`dispatch__item dispatch__item--${stage}`}>
                    <div className="dispatch__what">
                      <span className="dispatch__product">
                        {order.product_name} · {quantity(order.quantity)} {order.unit}
                      </span>
                      <span className={`dispatch__stage dispatch__stage--${stage}`}>{STAGE_TEXT[stage]}</span>
                      <span className="dispatch__ref">{order.checkout_reference ?? ""}</span>
                    </div>
                    <div className="dispatch__leg">
                      <span className="dispatch__leg-label">Collect from</span>
                      <span className="dispatch__name">{order.farm_name ?? "Farm"}</span>
                      <span>{[order.farm_address, order.farm_town].filter(Boolean).join(", ")}</span>
                      <Phone number={order.farm_phone} />
                    </div>
                    <div className="dispatch__leg">
                      <span className="dispatch__leg-label">Deliver to</span>
                      <span className="dispatch__name">{order.buyer_name ?? "Buyer"}</span>
                      <span>{order.delivery_address}</span>
                      <Phone number={order.buyer_phone} />
                      {order.buyer_note && <span className="dispatch__note">“{order.buyer_note}”</span>}
                    </div>
                    <div className="dispatch__actions no-print">
                      {NEXT(order).map((step) => (
                        <button
                          key={step.stage}
                          className={`btn btn--sm ${step.stage === "delivered" ? "btn--ink" : "btn--outline"}`}
                          disabled={busyId === order.id}
                          onClick={() => move(order, step.stage)}
                        >
                          {step.label}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

import { useCallback } from "react";
import { Link } from "react-router";
import * as api from "../../api/endpoints";
import { Notice, PageLoader } from "../../components/Feedback";
import { Icon } from "../../components/Icon";
import { RevenueBars } from "../../components/RevenueBars";
import { naira } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import type { AdminOverview } from "../../types";

const SETUP: { key: keyof AdminOverview["setup"]; label: string; how: string; to?: string }[] = [
  { key: "delivery_areas", label: "Delivery areas", how: "Add at least one area and its fee", to: "/admin/delivery" },
  { key: "payments", label: "Online payment", how: "Add Paystack or Interswitch keys on Render (API service)" },
  { key: "commission", label: "Commission", how: "Set FieldBasket's share of each sale", to: "/admin/settings" },
  { key: "operator_name", label: "Business name", how: "Shown in the Terms and Privacy Policy", to: "/admin/settings" },
  { key: "support_contact", label: "Support contact", how: "An email or phone buyers can reach", to: "/admin/settings" },
  { key: "email", label: "Email alerts", how: "Add SMTP settings on Render (API service)" },
  { key: "error_alerts", label: "Error alerts", how: "Optional: add SENTRY_DSN on Render (API service)" },
];

function Tile({ label, value, note, to, tone }: { label: string; value: string | number; note?: string; to?: string; tone?: "alert" }) {
  const body = (
    <>
      <span className="tile__label">{label}</span>
      <span className="tile__value">{value}</span>
      {note && <span className="tile__note">{note}</span>}
    </>
  );
  const cls = `tile${tone === "alert" ? " tile--alert" : ""}`;
  return to ? <Link to={to} className={`${cls} tile--link`}>{body}</Link> : <div className={cls}>{body}</div>;
}

export default function AdminHome() {
  const load = useCallback(() => api.getAdminOverview(), []);
  const { data, error, loading } = useApi(load);

  if (loading && !data) return <PageLoader />;
  if (!data) return <Notice tone="error">{error ?? "Couldn't load the dashboard."}</Notice>;

  const missing = SETUP.filter((s) => !data.setup[s.key]);

  return (
    <>
      <div className="admin__top">
        <h1 className="admin__title">Today</h1>
      </div>

      {missing.length > 0 && (
        <section className="setup" aria-label="Setup checklist">
          <h2 className="setup__title">
            Finish setting up · {SETUP.length - missing.length} of {SETUP.length} done
          </h2>
          <ul className="setup__list">
            {SETUP.map((item) => {
              const done = data.setup[item.key];
              return (
                <li key={item.key} className={`setup__item${done ? " is-done" : ""}`}>
                  <span className="setup__mark" aria-hidden="true">{done && <Icon name="check" size={14} strokeWidth={2.6} />}</span>
                  <span className="setup__text">
                    <span className="setup__label">{item.label}</span>
                    {!done && <span className="setup__how">{item.how}</span>}
                  </span>
                  {!done && item.to && <Link to={item.to} className="btn btn--outline btn--sm">Set up</Link>}
                  <span className="sr-only">{done ? "done" : "not done"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="tiles">
        <Tile label="Paid today" value={naira(data.revenue_today)} note={`${data.orders_today} ${data.orders_today === 1 ? "order" : "orders"}`} />
        <Tile label="Last 7 days" value={naira(data.revenue_7_days)} />
        <Tile label="Commission, 30 days" value={naira(data.commission_30_days)} note={`Current rate ${Number(data.commission_percent)}%`} to="/admin/settings" />
        <Tile label="Owed to farms" value={naira(data.payouts_owed)} note={`${data.payouts_owed_farms} ${data.payouts_owed_farms === 1 ? "farm" : "farms"}`} to="/admin/payouts" />
      </div>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Paid takings, last 30 days · {naira(data.revenue_30_days)}</h2>
        <RevenueBars days={data.daily} />
      </section>

      <h2 className="admin__section-title">Needs attention</h2>
      <div className="tiles">
        <Tile label="Ready for pickup" value={data.ready_for_pickup} note={`${data.on_the_way} on the way`} to="/admin/dispatch" tone={data.ready_for_pickup ? "alert" : undefined} />
        <Tile label="Waiting for a farm" value={data.awaiting_farm} note="Paid, not yet accepted" />
        <Tile label="Farms to verify" value={data.farms_pending} note={`${data.farms_approved} verified`} to="/admin/farms" tone={data.farms_pending ? "alert" : undefined} />
        <Tile label="Refunds due" value={data.refunds_due} note="Send, then mark refunded" to="/admin/orders" tone={data.refunds_due ? "alert" : undefined} />
      </div>
      <p className="admin__foot">
        {data.live_listings} live listings · {data.buyers} buyer accounts
      </p>
    </>
  );
}

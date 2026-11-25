import { useCallback } from "react";
import { Link } from "react-router";
import * as api from "../../api/endpoints";
import { Notice, PageLoader } from "../../components/Feedback";
import { naira, shortDate } from "../../lib/format";
import { useApi } from "../../lib/useApi";

export default function Earnings() {
  const load = useCallback(() => api.getMyEarnings(), []);
  const { data, error, loading } = useApi(load);

  return (
    <>
      <header className="ink-header ink-header--tall">
        <h1 className="ink-header__heading">Earnings</h1>
        {data && (
          <div className="kpi">
            <span className="kpi__label">Owed to you</span>
            <span className="kpi__value">{naira(data.owed)}</span>
            <span className="kpi__label">
              {data.owed_orders
                ? `For ${data.owed_orders} delivered order${data.owed_orders === 1 ? "" : "s"}, paid out regularly`
                : "Nothing waiting right now"}
            </span>
          </div>
        )}
      </header>
      <main className="page">
        {error && <Notice tone="error">{error}</Notice>}
        {loading && !data ? (
          <PageLoader />
        ) : (
          data && (
            <>
              {!data.has_bank_details && (
                <Notice tone="warning">
                  Add your payout account so we can pay you. <Link to="/farm/profile">Add bank details</Link>
                </Notice>
              )}
              <dl className="earn-grid">
                <div>
                  <dt>On the way to you</dt>
                  <dd>{naira(data.in_progress)}</dd>
                  <span className="muted small">
                    {data.in_progress_orders} paid order{data.in_progress_orders === 1 ? "" : "s"} not yet delivered
                  </span>
                </div>
                <div>
                  <dt>Paid to you so far</dt>
                  <dd>{naira(data.paid_out)}</dd>
                </div>
              </dl>
              <p className="muted small">
                You receive each order's price less FieldBasket's commission ({Number(data.commission_percent)}% on new
                orders). The rate on each order is fixed when the buyer pays.
              </p>

              <h2 className="section-title">Payouts</h2>
              {data.payouts.length === 0 ? (
                <p className="muted">No payouts yet. Delivered orders are paid out to your account.</p>
              ) : (
                <ul className="rows">
                  {data.payouts.map((p) => (
                    <li key={p.id} className="row row--static">
                      <span className="row__main">
                        <span className="row__title">{naira(p.amount)}</span>
                        <span className="row__sub">
                          {p.order_count} order{p.order_count === 1 ? "" : "s"} · {p.bank_name} ••••{p.account_number?.slice(-4)}
                        </span>
                        <span className="row__sub">Ref {p.transfer_reference}</span>
                      </span>
                      <span className="row__end">
                        <span className="row__sub">{shortDate(p.created_at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )
        )}
      </main>
    </>
  );
}

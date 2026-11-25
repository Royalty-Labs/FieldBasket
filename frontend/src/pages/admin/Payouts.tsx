import { useCallback, useState, type FormEvent } from "react";
import { Link } from "react-router";
import * as api from "../../api/endpoints";
import { EmptyState, Notice, PageLoader } from "../../components/Feedback";
import { naira, shortDate } from "../../lib/format";
import { errorMessage, useApi } from "../../lib/useApi";
import { telLink } from "../../settings/siteSettings";
import type { PayoutDue } from "../../types";

function DueCard({ due, onPaid }: { due: PayoutDue; onPaid: () => void }) {
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasBank = Boolean(due.account_number);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = window.confirm(
      `Record ${naira(due.amount)} sent to ${due.farm_name} (${due.bank_name} ${due.account_number})? Only do this after the transfer has gone through.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.recordPayout({ farmer_id: due.farmer_id, transfer_reference: reference.trim(), note: note.trim() || null });
      onPaid();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <article className="payout">
      <div className="payout__head">
        <div>
          <h3 className="payout__farm">{due.farm_name}</h3>
          <p className="payout__sub">
            {due.farmer_name} · <a href={telLink(due.phone)}>{due.phone}</a>
          </p>
        </div>
        <div className="payout__amount">
          <span>{naira(due.amount)}</span>
          <span className="payout__sub">
            {due.order_count} delivered {due.order_count === 1 ? "order" : "orders"} · {naira(due.gross_amount)} less{" "}
            {naira(due.commission_amount)} commission
          </span>
        </div>
      </div>
      {hasBank ? (
        <dl className="payout__bank">
          <div><dt>Bank</dt><dd>{due.bank_name}</dd></div>
          <div><dt>Account number</dt><dd className="mono">{due.account_number}</dd></div>
          <div><dt>Account name</dt><dd>{due.account_name}</dd></div>
          {due.bank_updated_at && <div><dt>Details updated</dt><dd>{shortDate(due.bank_updated_at)}</dd></div>}
        </dl>
      ) : (
        <Notice tone="warning">
          This farm hasn't added bank details yet. Ask them to add them under Farm → Payout account.
        </Notice>
      )}
      {hasBank && (
        <form className="payout__form" onSubmit={submit}>
          <input className="input input--sm" required minLength={3} maxLength={100} aria-label="Transfer reference" placeholder="Transfer reference from your bank" value={reference} onChange={(e) => setReference(e.target.value)} />
          <input className="input input--sm" maxLength={1000} aria-label="Note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn--ink btn--sm" disabled={busy}>Record payout</button>
        </form>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </article>
  );
}

export default function Payouts() {
  const loadDue = useCallback(() => api.listPayoutsDue(), []);
  const loadHistory = useCallback(() => api.listPayouts(), []);
  const due = useApi(loadDue);
  const history = useApi(loadHistory);
  const refresh = () => {
    due.reload();
    history.reload();
  };
  const totalDue = (due.data ?? []).reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <>
      <div className="admin__top">
        <h1 className="admin__title">Payouts</h1>
      </div>
      <p className="admin__lead">
        Farms are owed for delivered, paid orders, less the commission that applied when each order was paid. Send the
        money from your bank or the Paystack dashboard, then record it here with the transfer reference; the farm gets an
        email. Commission is set in <Link to="/admin/settings">Settings</Link>.
      </p>

      <h2 className="admin__section-title">To pay{totalDue ? ` · ${naira(totalDue)}` : ""}</h2>
      {due.error && <Notice tone="error">{due.error}</Notice>}
      {due.loading && !due.data ? (
        <PageLoader />
      ) : (due.data ?? []).length === 0 ? (
        <EmptyState title="No farm is owed anything right now" body="Delivered orders appear here for payment." />
      ) : (
        <div className="stack">
          {due.data!.map((d) => <DueCard key={d.farmer_id} due={d} onPaid={refresh} />)}
        </div>
      )}

      <h2 className="admin__section-title">Paid</h2>
      {(history.data ?? []).length === 0 ? (
        <p className="muted">No payouts recorded yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Farm</th>
                <th scope="col">Sent to</th>
                <th scope="col">Reference</th>
                <th scope="col">Orders</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {history.data!.map((p) => (
                <tr key={p.id}>
                  <td className="muted">{shortDate(p.created_at)}</td>
                  <td className="table__strong">{p.farm_name ?? "Farm"}</td>
                  <td>{p.bank_name}<span className="table__sub mono">{p.account_number}</span></td>
                  <td className="mono">{p.transfer_reference}{p.note && <span className="table__sub">{p.note}</span>}</td>
                  <td>{p.order_count}</td>
                  <td className="table__strong">{naira(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

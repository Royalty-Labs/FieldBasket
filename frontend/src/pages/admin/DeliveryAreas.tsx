import { useCallback, useState, type FormEvent } from "react";
import * as api from "../../api/endpoints";
import { EmptyState, Notice, PageLoader } from "../../components/Feedback";
import { naira } from "../../lib/format";
import { errorMessage, useApi } from "../../lib/useApi";
import type { DeliveryZone } from "../../types";

type Draft = { name: string; description: string; fee: string; sort_order: string };

const EMPTY: Draft = { name: "", description: "", fee: "", sort_order: "0" };

function toData(draft: Draft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    fee: draft.fee.trim() || "0",
    sort_order: Number(draft.sort_order) || 0,
  };
}

function ZoneForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (draft: Draft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(draft);
      if (!onCancel) setDraft(EMPTY);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="zone-form" onSubmit={submit}>
      <label className="zone-form__field">
        <span className="field__label">Area</span>
        <input className="input input--sm" required minLength={2} maxLength={100} placeholder="e.g. Ikere-Ekiti" value={draft.name} onChange={set("name")} />
      </label>
      <label className="zone-form__field">
        <span className="field__label">Fee (₦)</span>
        <input className="input input--sm" required type="number" min="0" step="50" inputMode="numeric" placeholder="1500" value={draft.fee} onChange={set("fee")} />
      </label>
      <label className="zone-form__field zone-form__field--wide">
        <span className="field__label">Note for buyers</span>
        <input className="input input--sm" maxLength={250} placeholder="e.g. Delivered within 24 hours" value={draft.description} onChange={set("description")} />
      </label>
      <label className="zone-form__field zone-form__field--narrow">
        <span className="field__label">Order</span>
        <input className="input input--sm" type="number" min="0" max="10000" value={draft.sort_order} onChange={set("sort_order")} />
      </label>
      <div className="zone-form__actions">
        {onCancel && (
          <button type="button" className="btn btn--text" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn btn--ink btn--sm" disabled={busy}>
          {submitLabel}
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  );
}

function ZoneRow({ zone, onChanged }: { zone: DeliveryZone; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="zone zone--editing">
        <ZoneForm
          initial={{
            name: zone.name,
            description: zone.description ?? "",
            fee: String(Number(zone.fee)),
            sort_order: String(zone.sort_order),
          }}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={async (draft) => {
            await api.updateDeliveryZone(zone.id, toData(draft));
            setEditing(false);
            onChanged();
          }}
        />
      </li>
    );
  }

  return (
    <li className={`zone${zone.is_active ? "" : " is-off"}`}>
      <div className="zone__main">
        <span className="zone__name">{zone.name}</span>
        <span className="zone__note">{zone.description || "No note"}</span>
      </div>
      <span className="zone__fee">{Number(zone.fee) === 0 ? "Free" : naira(zone.fee)}</span>
      <div className="zone__actions">
        <label className="switch">
          <input
            type="checkbox"
            checked={zone.is_active}
            disabled={busy}
            onChange={() => run(() => api.updateDeliveryZone(zone.id, { is_active: !zone.is_active }))}
          />
          <span>{zone.is_active ? "Delivering" : "Paused"}</span>
        </label>
        <button className="btn btn--outline btn--sm" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          className="btn btn--text-danger btn--sm"
          disabled={busy}
          onClick={() => window.confirm(`Remove ${zone.name}? Past orders keep its name.`) && run(() => api.deleteDeliveryZone(zone.id))}
        >
          Remove
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </li>
  );
}

export default function DeliveryAreas() {
  const load = useCallback(() => api.listAllDeliveryZones(), []);
  const { data, error, loading, reload } = useApi(load);

  return (
    <>
      <div className="admin__top">
        <h1 className="admin__title">Delivery areas</h1>
      </div>
      <p className="admin__lead">
        Buyers choose one of these areas at checkout and pay its fee with their order. Pause an area to stop taking
        orders for it without losing its settings.
      </p>

      <section className="admin__panel" aria-label="Add a delivery area">
        <h2 className="admin__panel-title">Add an area</h2>
        <ZoneForm
          initial={EMPTY}
          submitLabel="Add area"
          onSubmit={async (draft) => {
            await api.createDeliveryZone({ ...toData(draft), is_active: true });
            reload();
          }}
        />
      </section>

      {error && <Notice tone="error">{error}</Notice>}
      {loading && !data ? (
        <PageLoader />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No delivery areas yet" body="Add the first area above. Checkout opens once at least one area is delivering." />
      ) : (
        <ul className="zones">
          {data.map((zone) => (
            <ZoneRow key={zone.id} zone={zone} onChanged={reload} />
          ))}
        </ul>
      )}
    </>
  );
}

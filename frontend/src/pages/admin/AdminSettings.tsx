import { useCallback, useState, type FormEvent } from "react";
import * as api from "../../api/endpoints";
import { Notice, PageLoader } from "../../components/Feedback";
import { TextField } from "../../components/Fields";
import { naira } from "../../lib/format";
import { errorMessage, useApi } from "../../lib/useApi";
import { setSiteSettings } from "../../settings/siteSettings";
import type { AdminSettings as Settings } from "../../types";

function SettingsForm({ initial }: { initial: Settings }) {
  const [form, setForm] = useState({
    commission_percent: String(Number(initial.commission_percent)),
    service_area: initial.service_area,
    operator_name: initial.operator_name ?? "",
    support_email: initial.support_email ?? "",
    support_phone: initial.support_phone ?? "",
    support_whatsapp: initial.support_whatsapp ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm({ ...form, [key]: e.target.value });
  };
  const rate = Number(form.commission_percent) || 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await api.updateAdminSettings({
        commission_percent: form.commission_percent.trim() || "0",
        service_area: form.service_area.trim(),
        operator_name: form.operator_name.trim() || null,
        support_email: form.support_email.trim() || null,
        support_phone: form.support_phone.trim() || null,
        support_whatsapp: form.support_whatsapp.trim() || null,
      });
      setSiteSettings({
        service_area: next.service_area,
        operator_name: next.operator_name,
        support_email: next.support_email,
        support_phone: next.support_phone,
        support_whatsapp: next.support_whatsapp,
      });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="settings" onSubmit={submit}>
      <section className="admin__panel">
        <h2 className="admin__panel-title">Commission</h2>
        <p className="admin__hint">
          FieldBasket's share of each item's price. It's fixed on each order when the buyer pays, so changing it only
          affects new orders. Delivery fees aren't included; they stay with FieldBasket.
        </p>
        <div className="settings__row">
          <TextField
            id="commission"
            label="Commission (%)"
            type="number"
            min="0"
            max="50"
            step="0.5"
            inputMode="decimal"
            required
            value={form.commission_percent}
            onChange={set("commission_percent")}
          />
          <p className="settings__example">
            On a {naira(10000)} order the farm receives <strong>{naira(10000 - (10000 * rate) / 100)}</strong> and
            FieldBasket keeps <strong>{naira((10000 * rate) / 100)}</strong>.
          </p>
        </div>
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Business details</h2>
        <p className="admin__hint">Shown on the website footer and in the Terms of Use and Privacy Policy.</p>
        <div className="settings__grid">
          <TextField id="operator" label="Registered business name" placeholder="As registered with the CAC" maxLength={150} value={form.operator_name} onChange={set("operator_name")} />
          <TextField id="area" label="Service area" required minLength={2} maxLength={100} value={form.service_area} onChange={set("service_area")} />
          <TextField id="email" label="Support email" type="email" maxLength={255} value={form.support_email} onChange={set("support_email")} />
          <TextField id="phone" label="Support phone" type="tel" maxLength={30} value={form.support_phone} onChange={set("support_phone")} />
          <TextField id="whatsapp" label="WhatsApp number" type="tel" maxLength={30} hint="Leave empty to hide." value={form.support_whatsapp} onChange={set("support_whatsapp")} />
        </div>
      </section>

      {error && <Notice tone="error">{error}</Notice>}
      {saved && <Notice tone="success">Settings saved. The website shows the new details now.</Notice>}
      <div className="settings__actions">
        <button className="btn btn--ink" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
      </div>
    </form>
  );
}

export default function AdminSettings() {
  const load = useCallback(() => api.getAdminSettings(), []);
  const { data, error, loading } = useApi(load);
  return (
    <>
      <div className="admin__top">
        <h1 className="admin__title">Settings</h1>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {loading && !data ? <PageLoader /> : data && <SettingsForm initial={data} />}
    </>
  );
}

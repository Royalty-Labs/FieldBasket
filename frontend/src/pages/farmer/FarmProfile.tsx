import { useCallback, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import * as api from "../../api/endpoints";
import { useAuth } from "../../auth/useAuth";
import { Notice, PageLoader } from "../../components/Feedback";
import { TextAreaField, TextField } from "../../components/Fields";
import { Icon, VerifiedMark } from "../../components/Icon";
import { errorMessage, useApi } from "../../lib/useApi";
import type { FarmerProfile } from "../../types";

function ProfileForm({ profile, onSaved }: { profile: FarmerProfile | null; onSaved: () => void }) {
  const [form, setForm] = useState({
    farm_name: profile?.farm_name ?? "",
    phone: profile?.phone ?? "",
    town: profile?.town ?? "",
    address: profile?.address ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.saveMyProfile(
        {
          farm_name: form.farm_name.trim(),
          phone: form.phone.trim(),
          town: form.town.trim(),
          address: form.address.trim() || null,
        },
        Boolean(profile),
      );
      setSaved(profile ? "Farm details saved." : "Farm submitted for verification.");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <TextField id="farm" label="Farm name" required minLength={2} maxLength={150} value={form.farm_name} onChange={(e) => setForm({ ...form, farm_name: e.target.value })} />
      <TextField id="phone" label="Phone number" type="tel" autoComplete="tel" required minLength={7} maxLength={30} hint="Our team calls this number to verify your farm." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <TextField id="town" label="Town" required minLength={2} maxLength={100} placeholder="e.g. Ikere-Ekiti" value={form.town} onChange={(e) => setForm({ ...form, town: e.target.value })} />
      <TextAreaField id="address" label="Farm address" optional rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      {error && <Notice tone="error">{error}</Notice>}
      {saved && <Notice tone="success">{saved}</Notice>}
      <button className="btn btn--ink btn--block" disabled={busy}>
        {busy ? "Saving…" : profile ? "Save changes" : "Submit for verification"}
      </button>
    </form>
  );
}

function BankForm({ profile, onSaved }: { profile: FarmerProfile; onSaved: () => void }) {
  const [form, setForm] = useState({
    bank_name: profile.bank_name ?? "",
    account_number: profile.account_number ?? "",
    account_name: profile.account_name ?? "",
  });
  const [editing, setEditing] = useState(!profile.account_number);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.saveBankDetails({
        bank_name: form.bank_name.trim(),
        account_number: form.account_number.replace(/\s/g, ""),
        account_name: form.account_name.trim(),
      });
      setSaved(true);
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bank" aria-labelledby="bank-title">
      <h2 id="bank-title" className="section-title">
        <Icon name="bank" size={18} /> Payout account
      </h2>
      <p className="muted small">Where FieldBasket sends the money for your delivered orders.</p>
      {!editing ? (
        <div className="bank__summary">
          <div>
            <span className="bank__name">{profile.account_name}</span>
            <span className="muted small">
              {profile.bank_name} · ••••{profile.account_number?.slice(-4)}
            </span>
          </div>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditing(true)}>
            Change
          </button>
        </div>
      ) : (
        <form className="form" onSubmit={handleSubmit}>
          <TextField id="bank" label="Bank" required minLength={2} maxLength={100} placeholder="e.g. GTBank, Opay, Access Bank" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
          <TextField id="account" label="Account number" required inputMode="numeric" autoComplete="off" pattern={"[0-9 ]{10,13}"} maxLength={13} hint="10 digits (NUBAN)." value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
          <TextField id="account-name" label="Account name" required minLength={2} maxLength={150} hint="Exactly as your bank shows it." value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
          {error && <Notice tone="error">{error}</Notice>}
          <button className="btn btn--ink btn--block" disabled={busy}>
            {busy ? "Saving…" : "Save payout account"}
          </button>
        </form>
      )}
      {saved && !editing && <Notice tone="success">Payout account saved.</Notice>}
    </section>
  );
}

export default function FarmProfile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const load = useCallback(() => api.getMyProfile(), []);
  const { data, error, loading, reload } = useApi(load);

  if (loading && data === undefined) return <PageLoader />;
  const profile = data ?? null;

  return (
    <>
      <header className="ink-header">
        <div className="ink-header__row">
          <h1 className="ink-header__heading">{profile ? "Your farm" : "Set up your farm"}</h1>
          {profile?.verification_status === "approved" && (
            <span className="ink-header__status">
              <VerifiedMark size={14} onDark /> Verified
            </span>
          )}
        </div>
      </header>
      <main className="page">
        {error && <Notice tone="error">{error}</Notice>}
        {profile?.verification_status === "pending" && (
          <Notice tone="warning">We're checking your farm details. This usually includes a call to your phone number.</Notice>
        )}
        {profile?.verification_status === "rejected" && (
          <Notice tone="error">
            Changes needed: {profile.rejection_reason}. Update your details below and save to send them for review again.
          </Notice>
        )}
        {profile?.verification_status === "approved" && (
          <Notice>
            Changing these details sends your farm for a quick re-check. Your listings are hidden
            from buyers until it is approved again.
          </Notice>
        )}
        <ProfileForm profile={profile} onSaved={reload} />
        {profile && <BankForm key={profile.bank_updated_at ?? "none"} profile={profile} onSaved={reload} />}

        <div className="account-strip">
          <span className="muted small">Signed in as {user?.email}</span>
          <button
            className="btn btn--text"
            onClick={() => {
              signOut();
              navigate("/", { replace: true });
            }}
          >
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      </main>
    </>
  );
}

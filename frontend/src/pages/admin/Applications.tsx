import { useCallback, useState } from "react";
import * as api from "../../api/endpoints";
import { EmptyState, Notice, PageLoader } from "../../components/Feedback";
import { Icon } from "../../components/Icon";
import { shortDate } from "../../lib/format";
import { errorMessage, useApi } from "../../lib/useApi";
import type { AdminFarmerProfile, VerificationStatus } from "../../types";

const TABS: { key: VerificationStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function ApplicationRow({ profile, onChanged }: { profile: AdminFarmerProfile; onChanged: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(status: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      await api.reviewFarmerApplication(profile.id, status, status === "rejected" ? reason.trim() : undefined);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <tr>
        <td className="table__strong">{profile.farm_name}</td>
        <td>
          {profile.user.full_name}
          <span className="table__sub">{profile.user.email}</span>
        </td>
        <td>{profile.town}</td>
        <td>
          <a href={`tel:${profile.phone}`}>{profile.phone}</a>
        </td>
        <td className="muted">{shortDate(profile.created_at)}</td>
        <td className="table__actions">
          {profile.verification_status === "pending" ? (
            !rejecting && (
              <>
                <button className="btn btn--outline btn--sm" disabled={busy} onClick={() => setRejecting(true)}>
                  Reject
                </button>
                <button className="btn btn--ink btn--sm" disabled={busy} onClick={() => review("approved")}>
                  Approve
                </button>
              </>
            )
          ) : (
            <span className={`status status--${profile.verification_status === "approved" ? "completed" : "rejected"}`}>
              <span className="status__dot" aria-hidden="true" />
              {profile.verification_status === "approved" ? "Approved" : "Rejected"}
            </span>
          )}
        </td>
      </tr>
      {(rejecting || error || (profile.verification_status === "rejected" && profile.rejection_reason)) && (
        <tr className="table__detail">
          <td colSpan={6}>
            {error && <Notice tone="error">{error}</Notice>}
            {profile.verification_status === "rejected" && profile.rejection_reason && (
              <span className="muted">Reason given: {profile.rejection_reason}</span>
            )}
            {rejecting && (
              <div className="inline-form">
                <label htmlFor={`reason-${profile.id}`} className="field__label">
                  Reason the farmer will see
                </label>
                <input
                  id={`reason-${profile.id}`}
                  className="input input--sm"
                  placeholder="e.g. Phone number could not be reached"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <button className="btn btn--text" onClick={() => setRejecting(false)}>
                  Cancel
                </button>
                <button className="btn btn--danger btn--sm" disabled={busy || !reason.trim()} onClick={() => review("rejected")}>
                  Confirm rejection
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function Applications() {
  const [tab, setTab] = useState<VerificationStatus>("pending");
  const [search, setSearch] = useState("");
  const load = useCallback(() => api.listFarmerApplications(), []);
  const { data, error, loading, reload } = useApi(load);

  const all = data ?? [];
  const term = search.trim().toLowerCase();
  const rows = all.filter(
    (p) =>
      p.verification_status === tab &&
      (!term ||
        [p.farm_name, p.user.full_name, p.user.email, p.town].some((v) => v.toLowerCase().includes(term))),
  );
  const count = (status: VerificationStatus) => all.filter((p) => p.verification_status === status).length;

  return (
    <>
        <div className="admin__top">
          <h1 className="admin__title">Farmer applications</h1>
          <label className="search search--light">
            <Icon name="search" size={16} />
            <input
              type="search"
              aria-label="Search applications"
              placeholder="Search farm, owner or town"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        <div className="tabs tabs--light" role="tablist" aria-label="Status filter">
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

        {error && <Notice tone="error">{error}</Notice>}

        {loading && !data ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState title={term ? "No matches" : "No applications in this list"} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Farm</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Town</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Submitted</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((profile) => (
                  <ApplicationRow key={profile.id} profile={profile} onChanged={reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}

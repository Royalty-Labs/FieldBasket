import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { homePathFor } from "../auth/authContext";
import { useAuth } from "../auth/useAuth";
import { Notice } from "../components/Feedback";
import { TextField } from "../components/Fields";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { errorMessage } from "../lib/useApi";
import { resumePendingAdd } from "../basket/basketStore";
import { useUi } from "../ui/uiContext";

/** Only follow a ?next= path inside this app. */
function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

function useResumeToast() {
  const { showToast } = useUi();
  return (item: { name: string } | null) => {
    if (item) showToast(`${item.name} added to your basket`, { label: "View basket", to: "/basket" });
  };
}

function AuthFrame({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <main className="auth">
      <header className="auth__header">
        <Link to="/" className="icon-button icon-button--dark" aria-label="Back to start">
          <Icon name="chevronLeft" size={20} strokeWidth={2} />
        </Link>
        <Logo />
      </header>
      <div className="auth__body">
        <h1 className="auth__title">{title}</h1>
        <p className="auth__lead">{lead}</p>
        {children}
      </div>
    </main>
  );
}

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const announceResumedAdd = useResumeToast();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // While submitting, the form decides where to go (e.g. ?next= or farm setup).
  if (user && !busy) return <Navigate to={homePathFor(user.role)} replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signedIn = await signIn(form.email.trim(), form.password);
      announceResumedAdd(resumePendingAdd(signedIn));
      navigate(safeNext(params.get("next")) ?? homePathFor(signedIn.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Welcome back" lead="Sign in to see your orders and listings.">
      <form className="form" onSubmit={handleSubmit}>
        {error && <Notice tone="error">{error}</Notice>}
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <button className="btn btn--lime btn--block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="auth__switch">
        New to FieldBasket? <Link to={`/register${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`}>Create an account</Link>
      </p>
    </AuthFrame>
  );
}

export function RegisterPage() {
  const { user, signUp } = useAuth();
  const navigate = useNavigate();
  const announceResumedAdd = useResumeToast();
  const [params] = useSearchParams();
  const [role, setRole] = useState<"buyer" | "farmer">(params.get("role") === "farmer" ? "farmer" : "buyer");
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // While submitting, the form decides where to go (e.g. ?next= or farm setup).
  if (user && !busy) return <Navigate to={homePathFor(user.role)} replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await signUp({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        role,
      });
      announceResumedAdd(resumePendingAdd(created));
      const fallback = created.role === "farmer" ? "/farm/profile" : homePathFor(created.role);
      navigate(safeNext(params.get("next")) ?? fallback, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title="Create your account"
      lead={role === "farmer" ? "Set up your farm next. We verify every farm before it can sell." : "Order fresh produce straight from Ekiti farms."}
    >
      <form className="form" onSubmit={handleSubmit}>
        <div className="segmented segmented--dark" role="radiogroup" aria-label="Account type">
          {(["buyer", "farmer"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={role === option}
              className={`segmented__option${role === option ? " is-active" : ""}`}
              onClick={() => setRole(option)}
            >
              {option === "buyer" ? "I'm buying" : "I'm a farmer"}
            </button>
          ))}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <TextField
          id="name"
          label="Full name"
          autoComplete="name"
          required
          minLength={2}
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
        />
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <button className="btn btn--lime btn--block" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="auth__switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthFrame>
  );
}

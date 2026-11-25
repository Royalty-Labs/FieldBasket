import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { savePendingAdd } from "../basket/basketStore";
import { Icon } from "../components/Icon";
import { UiContext, type SignInRequest, type Toast, type UiContextValue } from "./uiContext";

const TOAST_MS = 4000;

function SignInDialog({ request, onClose }: { request: SignInRequest; onClose: () => void }) {
  const location = useLocation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const next = encodeURIComponent(location.pathname + location.search + location.hash);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog?.querySelector<HTMLElement>("a, button")?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && dialog) {
        // Keep keyboard focus inside the dialog.
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("a, button"));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey);
    document.body.classList.add("has-dialog");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("has-dialog");
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="dialog__close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <span className="dialog__icon" aria-hidden="true">
          <Icon name="basket" size={26} />
        </span>
        <h2 id="signin-title" className="dialog__title">
          {request.title}
        </h2>
        <p className="dialog__body">
          Browse as much as you like. To build a basket and order, sign in or create a free account.
          We'll bring you straight back here{request.pendingAdd ? ` and add ${request.pendingAdd.name.toLowerCase()} for you` : ""}.
        </p>
        <Link to={`/login?next=${next}`} className="btn btn--ink btn--block" onClick={onClose}>
          Sign in
        </Link>
        <Link to={`/register?next=${next}`} className="btn btn--outline btn--block" onClick={onClose}>
          Create a free account
        </Link>
      </div>
    </div>
  );
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [signIn, setSignIn] = useState<SignInRequest | null>(null);
  const nextId = useRef(1);

  const showToast = useCallback<UiContextValue["showToast"]>((message, action) => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-2), { id, message, action }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), TOAST_MS);
  }, []);

  const requireSignIn = useCallback<UiContextValue["requireSignIn"]>((request) => {
    if (request.pendingAdd) savePendingAdd(request.pendingAdd);
    setSignIn(request);
  }, []);

  const closeSignIn = useCallback(() => setSignIn(null), []);
  const value = useMemo(() => ({ showToast, requireSignIn }), [showToast, requireSignIn]);

  return (
    <UiContext.Provider value={value}>
      {children}
      {signIn && <SignInDialog request={signIn} onClose={closeSignIn} />}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <Icon name="check" size={18} strokeWidth={2.2} />
            <span className="toast__text">{toast.message}</span>
            {toast.action && (
              <Link to={toast.action.to} className="toast__action">
                {toast.action.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </UiContext.Provider>
  );
}

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { PageLoader } from "../components/Feedback";
import { homePathFor } from "./authContext";
import { useAuth } from "./useAuth";

export function RequireRole({ role, children }: { role: string; children: ReactNode }) {
  const { user, ready, signedOut } = useAuth();
  const location = useLocation();

  if (!ready) return <PageLoader />;

  if (!user) {
    // Someone who just signed out shouldn't be asked to sign back in.
    if (signedOut) return <Navigate to="/" replace />;
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (user.role !== role) return <Navigate to={homePathFor(user.role)} replace />;

  return <>{children}</>;
}

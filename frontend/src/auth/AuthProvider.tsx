import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearToken, getToken, saveToken } from "../api/client";
import * as api from "../api/endpoints";
import type { User } from "../types";
import { AuthContext, type AuthContextValue } from "./authContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: User | null; ready: boolean; signedOut?: boolean }>(() => ({
    user: null,
    ready: !getToken(),
  }));

  useEffect(() => {
    if (!getToken()) return;
    let active = true;
    api
      .getMe()
      .then((user) => {
        if (active) setState({ user, ready: true });
      })
      .catch(() => {
        clearToken();
        if (active) setState({ user: null, ready: true });
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await api.login(email, password);
    saveToken(response.access_token);
    setState({ user: response.user, ready: true });
    return response.user;
  }, []);

  const signUp = useCallback<AuthContextValue["signUp"]>(
    async (data) => {
      await api.register(data);
      return signIn(data.email, data.password);
    },
    [signIn],
  );

  const signOut = useCallback(() => {
    clearToken();
    setState({ user: null, ready: true, signedOut: true });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user: state.user, ready: state.ready, signedOut: Boolean(state.signedOut), signIn, signUp, signOut }),
    [state, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

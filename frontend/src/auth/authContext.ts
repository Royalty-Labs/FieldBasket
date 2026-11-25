import { createContext } from "react";
import type { Role, User } from "../types";

export type AuthContextValue = {
  user: User | null;
  ready: boolean;
  /** True right after the person chose to sign out (not a session expiry). */
  signedOut: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (data: {
    full_name: string;
    email: string;
    password: string;
    role: Exclude<Role, "admin">;
    accept_terms: boolean;
  }) => Promise<User>;
  signOut: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function homePathFor(role: string | undefined): string {
  if (role === "farmer") return "/farm";
  if (role === "admin") return "/admin";
  return "/shop";
}

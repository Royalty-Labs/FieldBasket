import { createContext, useContext } from "react";
import type { BasketItem } from "../basket/basketStore";

export type Toast = { id: number; message: string; action?: { label: string; to: string } };

export type SignInRequest = {
  /** Headline, e.g. "Sign in to add tomatoes to your basket". */
  title: string;
  /** An add to finish automatically once the guest has signed in. */
  pendingAdd?: BasketItem;
};

export type UiContextValue = {
  showToast: (message: string, action?: Toast["action"]) => void;
  requireSignIn: (request: SignInRequest) => void;
};

export const UiContext = createContext<UiContextValue | null>(null);

export function useUi() {
  const context = useContext(UiContext);
  if (!context) throw new Error("useUi must be used inside <UiProvider>.");
  return context;
}

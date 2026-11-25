import { useCallback } from "react";
import { useAuth } from "../auth/useAuth";
import type { Product } from "../types";
import { useUi } from "../ui/uiContext";
import { itemFromProduct } from "./basketStore";
import { useBasket } from "./useBasket";

/**
 * "Add to basket" for any visitor: buyers add straight away, guests are
 * asked to sign in (and the add finishes afterwards), farmers and admins
 * are told they need a buyer account.
 */
export function useAddToBasket() {
  const { user } = useAuth();
  const basket = useBasket();
  const { showToast, requireSignIn } = useUi();

  return useCallback(
    (product: Product, quantity = 1) => {
      const item = itemFromProduct(product, quantity);
      if (!user) {
        requireSignIn({
          title: `Sign in to add ${product.name.toLowerCase()} to your basket`,
          pendingAdd: item,
        });
        return;
      }
      if (user.role !== "buyer") {
        showToast("Ordering needs a buyer account. You're signed in as a " + user.role + ".");
        return;
      }
      basket.add(item);
      showToast(`${product.name} added to your basket`, { label: "View basket", to: "/basket" });
    },
    [user, basket, showToast, requireSignIn],
  );
}

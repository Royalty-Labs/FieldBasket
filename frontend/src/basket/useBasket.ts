import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "../auth/useAuth";
import {
  addToBasket,
  basketKey,
  getBasket,
  setBasket,
  subscribeBasket,
  type BasketItem,
} from "./basketStore";

/** The signed-in buyer's basket. Empty and read-only for everyone else. */
export function useBasket() {
  const { user } = useAuth();
  const key = user?.role === "buyer" ? basketKey(user.id) : null;
  const items = useSyncExternalStore(
    subscribeBasket,
    () => getBasket(key),
    () => getBasket(null),
  );

  const add = useCallback((item: BasketItem) => key && addToBasket(key, item), [key]);

  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (!key) return;
      setBasket(
        key,
        getBasket(key).map((i) =>
          i.productId === productId
            ? { ...i, quantity: Math.max(1, Math.min(i.maxQuantity, quantity)) }
            : i,
        ),
      );
    },
    [key],
  );

  const remove = useCallback(
    (productId: string) => key && setBasket(key, getBasket(key).filter((i) => i.productId !== productId)),
    [key],
  );

  const clear = useCallback(() => key && setBasket(key, []), [key]);

  return useMemo(
    () => ({
      enabled: key !== null,
      items,
      count: items.length,
      total: items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
      quantityOf: (productId: string) => items.find((i) => i.productId === productId)?.quantity ?? 0,
      add,
      setQuantity,
      remove,
      clear,
    }),
    [items, key, add, setQuantity, remove, clear],
  );
}

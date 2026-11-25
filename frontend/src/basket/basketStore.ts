import type { Product } from "../types";

/**
 * The basket lives on the buyer's device, one per account, so it
 * survives reloads and app restarts. The server re-checks every price
 * and stock level at checkout.
 */

export type BasketItem = {
  productId: string;
  name: string;
  unit: string;
  unitPrice: number;
  farmName: string | null;
  location: string;
  imageUrl: string | null;
  maxQuantity: number;
  quantity: number;
};

const EMPTY: BasketItem[] = [];
const listeners = new Set<() => void>();
let cache: { key: string | null; items: BasketItem[] } = { key: null, items: EMPTY };

export function basketKey(userId: string) {
  return `fieldbasket.basket.${userId}`;
}

function read(key: string): BasketItem[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as BasketItem[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function getBasket(key: string | null): BasketItem[] {
  if (!key) return EMPTY;
  if (cache.key !== key) cache = { key, items: read(key) };
  return cache.items;
}

export function setBasket(key: string, items: BasketItem[]) {
  cache = { key, items };
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Storage full or blocked: the basket still works for this visit.
  }
  notify();
}

export function subscribeBasket(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key === cache.key) {
      cache = { key: null, items: EMPTY };
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function itemFromProduct(product: Product, quantity: number): BasketItem {
  return {
    productId: product.id,
    name: product.name,
    unit: product.unit,
    unitPrice: Number(product.price_per_unit),
    farmName: product.farm_name,
    location: product.location,
    imageUrl: product.image_url,
    maxQuantity: Number(product.quantity_available),
    quantity,
  };
}

/** Add to a basket, merging with an item already in it. */
export function addToBasket(key: string, item: BasketItem) {
  const items = getBasket(key);
  const existing = items.find((i) => i.productId === item.productId);
  const next = existing
    ? items.map((i) =>
        i.productId === item.productId
          ? { ...item, quantity: Math.min(item.maxQuantity, i.quantity + item.quantity) }
          : i,
      )
    : [...items, { ...item, quantity: Math.min(item.maxQuantity, item.quantity) }];
  setBasket(key, next);
}

// An add a guest started before signing in, finished afterwards.
const PENDING_KEY = "fieldbasket.pending-add";

export function savePendingAdd(item: BasketItem) {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(item));
  } catch {
    // Without session storage the guest simply adds it again.
  }
}

export function takePendingAdd(): BasketItem | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    window.sessionStorage.removeItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as BasketItem) : null;
  } catch {
    return null;
  }
}

/** After sign-in: add the item a guest picked, if they're a buyer. */
export function resumePendingAdd(user: { id: string; role: string }): BasketItem | null {
  const pending = takePendingAdd();
  if (!pending || user.role !== "buyer") return null;
  addToBasket(basketKey(user.id), pending);
  return pending;
}

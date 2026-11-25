import { useEffect, useSyncExternalStore } from "react";
import { apiRequest } from "../api/client";

/** Business details an admin sets under Admin → Settings. */
export type SiteSettings = {
  service_area: string;
  operator_name: string | null;
  support_email: string | null;
  support_phone: string | null;
  support_whatsapp: string | null;
};

const CACHE_KEY = "fieldbasket:site-settings";

// Used only until the first answer from the API arrives (then cached).
const FIRST_VISIT: SiteSettings = {
  service_area: "Ekiti State",
  operator_name: null,
  support_email: null,
  support_phone: null,
  support_whatsapp: null,
};

function readCache(): SiteSettings {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? { ...FIRST_VISIT, ...JSON.parse(cached) } : FIRST_VISIT;
  } catch {
    return FIRST_VISIT;
  }
}

let current = readCache();
let requested = false;
const listeners = new Set<() => void>();

function publish(next: SiteSettings) {
  current = next;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: keep it in memory */
  }
  listeners.forEach((listener) => listener());
}

export function refreshSiteSettings() {
  return apiRequest<SiteSettings>("/settings/public")
    .then(publish)
    .catch(() => {
      /* offline: keep the cached copy */
    });
}

export function setSiteSettings(next: SiteSettings) {
  publish(next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The live business details, refreshed once per visit. */
export function useSiteSettings(): SiteSettings {
  useEffect(() => {
    if (!requested) {
      requested = true;
      refreshSiteSettings();
    }
  }, []);
  return useSyncExternalStore(subscribe, () => current, () => current);
}

/** "wa.me" link for a WhatsApp number written in local or international form. */
export function whatsappLink(number: string): string {
  const digits = number.replace(/\D/g, "");
  const international = digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
  return `https://wa.me/${international}`;
}

export function telLink(number: string): string {
  return `tel:${number.replace(/[^+\d]/g, "")}`;
}

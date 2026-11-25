/**
 * Site-wide settings. Change these (or set the matching VITE_ variables
 * in your hosting dashboard) instead of editing copy across the app.
 */

/** Where FieldBasket currently operates, as shown to visitors. */
export const SERVICE_AREA: string = import.meta.env.VITE_SERVICE_AREA || "Ekiti State";

/** Public contact address shown in the footer. Hidden when not set. */
export const CONTACT_EMAIL: string = import.meta.env.VITE_CONTACT_EMAIL || "";

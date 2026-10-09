/**
 * Microsoft Clarity integration (front-end / public pages only).
 *
 * The script is injected at runtime with the project ID stored in settings,
 * and is never loaded on staff, POS or admin pages.
 */

const SCRIPT_ID = "ms-clarity-script";

declare global {
  interface Window {
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

/** Routes that must never be tracked (staff / POS / admin / internal tools). */
const EXCLUDED_PREFIXES = [
  "/admin",
  "/staff",
  "/live-bookings",
  "/live-visitors",
  "/sadad-redirect",
  // the payment result address carries the booking reference, which is what opens the booking
  "/payment",
  "/sadad-callback",
];

export const isTrackablePath = (pathname: string): boolean => {
  const path = (pathname || "/").toLowerCase();
  return !EXCLUDED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(p));
};

export const isValidClarityId = (id: string | null | undefined): boolean =>
  !!id && /^[a-z0-9]{4,20}$/i.test(id.trim());

export const isClarityLoaded = (): boolean =>
  typeof document !== "undefined" && !!document.getElementById(SCRIPT_ID);

/** Injects the Clarity snippet once. Safe to call repeatedly. */
export const loadClarity = (projectId: string): void => {
  if (typeof window === "undefined") return;
  const id = projectId.trim();
  if (!isValidClarityId(id) || isClarityLoaded()) return;

  window.clarity =
    window.clarity ||
    function (...args: unknown[]) {
      (window.clarity!.q = window.clarity!.q || []).push(args);
    };

  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${encodeURIComponent(id)}`;
  script.onerror = () => console.warn("Clarity script failed to load");
  document.head.appendChild(script);
};

/** Removes the Clarity script (used when navigating into staff/admin areas). */
export const unloadClarity = (): void => {
  if (typeof document === "undefined") return;
  document.getElementById(SCRIPT_ID)?.remove();
};

const safeCall = (...args: unknown[]) => {
  try {
    window.clarity?.(...args);
  } catch {
    /* analytics must never break the app */
  }
};

/** Custom page/section tag, e.g. "checkout". */
export const clarityTag = (key: string, value: string) => safeCall("set", key, value);

/** Named custom event, e.g. "purchase_completed". */
export const clarityEvent = (name: string) => safeCall("event", name);

/** Marks a successful ticket purchase so admins can filter those sessions. */
export const clarityTrackPurchase = (params: {
  bookingReference: string;
  amount: number;
  quantity: number;
  paymentMethod?: string | null;
}) => {
  clarityEvent("ticket_purchase");
  clarityTag("booking_reference", params.bookingReference);
  clarityTag("purchase_amount", String(params.amount));
  clarityTag("ticket_quantity", String(params.quantity));
  if (params.paymentMethod) clarityTag("payment_method", params.paymentMethod);
  safeCall("upgrade", "ticket_purchase");
};

/** Marks a failed / cancelled payment session. */
export const clarityTrackPaymentFailure = (reason: string) => {
  clarityEvent("payment_failed");
  clarityTag("payment_failure_reason", reason);
  safeCall("upgrade", "payment_failed");
};

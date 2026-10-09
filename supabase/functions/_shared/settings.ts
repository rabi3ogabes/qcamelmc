// Typed view of the admin-only private_settings row plus a few helpers.

import type { SadadEnvironment } from "./sadad-api.ts";

export interface PrivateSettings {
  webhookUrl: string | null;
  adminPhone: string | null;
  merchantId: string | null;
  secret: string | null;
  apiKey: string | null;
  websiteDomain: string | null;
  environment: SadadEnvironment;
  siteUrl: string | null;
}

export function isSadadConfigured(s: PrivateSettings): boolean {
  return Boolean(s.merchantId?.trim() && s.secret?.trim() && s.websiteDomain?.trim());
}

/** Where Sadad POSTs the customer back to (a function, because it must accept a POST). */
export function callbackUrlFor(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/sadad-callback`;
}

/** Sadad requires an email; use a clearly-synthetic one on the shop's own domain. */
export function fallbackEmail(domain: string | null | undefined): string {
  const host = (domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host) return "noreply@example.invalid";
  return host.includes(".") ? `noreply@${host}` : `noreply@${host}.invalid`;
}

const SAFE_ORIGIN = /^(https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d+)?|http:\/\/localhost(:\d+)?)$/i;

/**
 * Where to send the customer after paying: the configured site URL, otherwise
 * the origin the order was placed from — but only if it is a bare https origin
 * (or localhost), so this can never become an open redirect.
 */
export function resolveReturnBase(siteUrl: string | null | undefined, storedOrigin: string | null | undefined): string | null {
  for (const candidate of [siteUrl, storedOrigin]) {
    const value = (candidate ?? "").trim().replace(/\/+$/, "");
    if (value && SAFE_ORIGIN.test(value)) return value;
  }
  return null;
}

/** Origin header value that is safe to remember for the post-payment redirect. */
export function safeOrigin(origin: string | null | undefined): string | null {
  return resolveReturnBase(null, origin);
}

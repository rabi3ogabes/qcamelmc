// Typed view of the server-only slice of the admin-only `settings` row (gateway
// credentials, automation URLs) plus a few helpers. A webhook the admin switched
// off in the settings screen comes through as null.

import type { SadadCredentials, SadadEnvironment } from "./sadad-api.ts";

export interface PrivateSettings {
  webhookUrl: string | null;
  /** Separate automation for e-mails (falls back to webhookUrl when unset). */
  emailWebhookUrl: string | null;
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

/** Merchant login must use the same saved credentials as checkout, with no fallback. */
export function sadadCredentialsFromSettings(s: PrivateSettings): SadadCredentials | null {
  const sadadId = s.merchantId?.trim();
  const secretKey = s.secret?.trim();
  const domain = s.websiteDomain?.trim();
  if (!sadadId || !secretKey || !domain) return null;
  return { sadadId, secretKey, domain };
}

/** Where Sadad sends the customer back: the shop's own /sadad-callback page on the registered domain (as when payments last succeeded); the page forwards the result to the sadad-callback function. */
export function siteCallbackUrl(websiteDomain: string): string {
  const host = websiteDomain.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return `https://${host}/sadad-callback`;
}

/** The server endpoint that verifies a returned payment (GET or POST). */
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

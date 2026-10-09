// POST /sadad-diagnose   (admins only)
//
// A readiness report for the payment setup: is everything configured, do the
// credentials really work against Sadad's API (live or test), and which URLs
// must be registered in the Sadad panel. The secret is never returned.

import { requireAdmin, type AuthDeps } from "./_shared/auth.ts";
import { HttpError, json, preflight, toErrorResponse } from "./_shared/http.ts";
import type { Repo } from "./_shared/repo.ts";
import { detectEnvironment, lookupTransaction, type SadadCredentials } from "./_shared/sadad-api.ts";
import { callbackUrlFor } from "./_shared/settings.ts";

export interface DiagnoseDeps {
  repo: Repo;
  auth: AuthDeps;
  fetch: typeof fetch;
  supabaseUrl: string;
}

type Status = "ok" | "warn" | "error";
interface Check {
  id: string;
  status: Status;
  message: string;
}

export function sadadDiagnoseHandler(deps: DiagnoseDeps) {
  return async (req: Request): Promise<Response> => {
    const early = preflight(req);
    if (early) return early;

    try {
      if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST");
      await requireAdmin(req, deps.auth);

      const settings = await deps.repo.getPrivateSettings();
      const checks: Check[] = [];
      const add = (id: string, status: Status, message: string) => checks.push({ id, status, message });

      if (settings.merchantId) add("merchant_id", "ok", `Merchant ID: ${settings.merchantId}`);
      else add("merchant_id", "error", "Merchant (Sadad) ID is not set");

      if (settings.secret) add("secret", "ok", `Secret key is set (${settings.secret.length} characters)`);
      else add("secret", "error", "Secret key is not set");

      if (!settings.websiteDomain) {
        add("website", "error", "Website domain is not set");
      } else if (/[/:\s]/.test(settings.websiteDomain)) {
        add("website", "warn", `"${settings.websiteDomain}" should be just the domain registered with Sadad (no https:// or path)`);
      } else {
        add("website", "ok", `Website: ${settings.websiteDomain}`);
      }

      let environment: "live" | "sandbox" | null = null;
      if (settings.merchantId && settings.secret && settings.websiteDomain) {
        const creds: SadadCredentials = {
          sadadId: settings.merchantId,
          secretKey: settings.secret,
          domain: settings.websiteDomain,
        };
        const login = await detectEnvironment({ fetch: deps.fetch, creds, environment: settings.environment });
        if (login.ok) {
          environment = login.environment;
          add("api_login", "ok", `Sadad API login works (${login.environment === "sandbox" ? "TEST/sandbox" : "LIVE"} credentials)`);
          const lookup = await lookupTransaction({
            fetch: deps.fetch,
            creds,
            environment: login.environment,
            orderRef: "DIAGNOSTIC-PING",
          });
          if (lookup.kind === "unavailable") add("api_lookup", "error", `Sadad transaction lookup failed (${lookup.error})`);
          else add("api_lookup", "ok", "Payment verification (transaction lookup) works");
        } else {
          add(
            "api_login",
            "error",
            `Sadad API login failed (${login.errors.join(", ")}). Payments cannot be verified automatically: check the merchant ID, the secret/API key and that the website domain matches the one the key was generated for.`,
          );
        }
      } else {
        add("api_login", "error", "Skipped: complete the settings above first");
      }

      const callbackUrl = callbackUrlFor(deps.supabaseUrl);
      const webhookUrl = `${deps.supabaseUrl.replace(/\/+$/, "")}/functions/v1/sadad-webhook`;
      add("callback_url", "ok", `Customers return from Sadad to: ${callbackUrl}`);
      add("webhook_registration", "warn", `Register this webhook URL in the Sadad merchant panel (Payment Gateway → Webhook): ${webhookUrl}`);
      if (settings.webhookUrl) add("automation", "ok", "Automation (n8n) webhook is configured");
      else add("automation", "warn", "No automation (n8n) webhook is configured: tickets will not be sent automatically");

      if (settings.siteUrl) add("site_url", "ok", `Customers are returned to ${settings.siteUrl}`);
      else add("site_url", "warn", "Site URL is not set: customers return to the address they ordered from (fine for a single site)");

      return json({
        success: true,
        ready: !checks.some((c) => c.status === "error"),
        environment,
        callbackUrl,
        webhookUrl,
        checks,
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

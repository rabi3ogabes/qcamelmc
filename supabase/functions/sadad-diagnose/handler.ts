// POST /sadad-diagnose   (admins only)
//
// A readiness report for the payment setup: is everything configured, do the
// credentials really work against Sadad's API (live or test), and which URLs
// must be registered in the Sadad panel. The secret is never returned.

import { requireAdmin, type AuthDeps } from "../_shared/auth.ts";
import { HttpError, json, preflight, toErrorResponse } from "../_shared/http.ts";
import type { Repo } from "../_shared/repo.ts";
import { detectEnvironment, lookupTransaction } from "../_shared/sadad-api.ts";
import { sadadCredentialsFromSettings, siteCallbackUrl } from "../_shared/settings.ts";

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

      if (settings.secret) add("secret", "ok", "Secret key is set");
      else add("secret", "error", "Secret key is not set");

      if (!settings.websiteDomain) {
        add("website", "error", "Website domain is not set");
      } else if (/[/:\s]/.test(settings.websiteDomain)) {
        add("website", "warn", `"${settings.websiteDomain}" should be just the domain registered with Sadad (no https:// or path)`);
      } else {
        add("website", "ok", `Website: ${settings.websiteDomain}`);
      }

      let environment: "live" | "sandbox" | null = null;
      let apiLogin: "accepted" | "rejected" | "unavailable" | "not_configured" = "not_configured";
      const creds = sadadCredentialsFromSettings(settings);
      if (creds) {
        // Trace only request structure and HTTP outcomes. Never retain body values or tokens.
        const attempts: string[] = [];
        const tracedFetch: typeof fetch = async (input, init) => {
          const url = String(input);
          const response = await deps.fetch(input, init);
          if (url.endsWith("/api/userbusinesses/login")) {
            attempts.push(`${init?.method ?? "GET"} ${url} → HTTP ${response.status}`);
          }
          return response;
        };
        const login = await detectEnvironment({ fetch: tracedFetch, creds, environment: settings.environment });
        add("api_request", "ok", "مصدر البيانات: الإعدادات فقط. الطلب JSON؛ الحقول: sadadId (number)، secretKey (string)، domain (string). Content-Type وAccept: application/json. لا يُرسل توقيع Checkout في هذا الطلب. التوثيق: https://developer.sadad.qa/API/Authentication");
        add("api_response", login.ok ? "ok" : "error", attempts.join(" | ") || "لم تصل استجابة HTTP من سداد.");
        if (login.ok) {
          apiLogin = "accepted";
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
          apiLogin = login.errors.every((error) => /_401$/.test(error)) ? "rejected" : "unavailable";
          add("api_login", "error", `لم يُقبل تسجيل الدخول إلى API (${login.errors.join(", ")}). هذا الفحص يخص صلاحية الوصول لواجهة التاجر فقط؛ لا يثبت صحة أو خطأ مفتاح Checkout أو توقيع الدفع. راجع مع سداد تفعيل واجهة التاجر وبيئة الحساب والنطاق وبيانات الدخول المحفوظة.`);
        }
        add(
          "checkout_signature",
          "warn",
          "قبول توقيع الدفع لدى سداد غير متحقق: لم يُرسل طلب دفع في هذا الفحص. التنفيذ الحالي يستخدم SHA256(secret + القيم مرتبة حسب أسماء الحقول)، بصيغة hex صغيرة، ويستبعد signature وchecksumhash وproductdetail. نجاح الاختبارات المحلية لا يثبت قبول سداد. خطأ Checksumhash قد يتعلق بالمفتاح أو الحقول الموقعة أو تنسيقها أو بيئة التكامل؛ لا يحدد السبب وحده. التوثيق: https://developer.sadad.qa/web-checkout_2.1/",
        );
      } else {
        add("api_login", "error", "Skipped: complete the settings above first");
      }

      const callbackUrl = settings.websiteDomain ? siteCallbackUrl(settings.websiteDomain) : "(set the website domain)";
      const webhookUrl = `${deps.supabaseUrl.replace(/\/+$/, "")}/functions/v1/sadad-webhook`;
      add("callback_url", "ok", `Customers return from Sadad to: ${callbackUrl}`);
      add("webhook_registration", "warn", `Register this webhook URL in the Sadad merchant panel (Payment Gateway → Webhook): ${webhookUrl}`);
      if (settings.webhookUrl) add("automation", "ok", "Automation (n8n) webhook is configured");
      else add("automation", "warn", "No automation (n8n) webhook is configured: tickets will not be sent automatically");

      if (settings.siteUrl) add("site_url", "ok", `Customers are returned to ${settings.siteUrl}`);
      else add("site_url", "warn", "Site URL is not set: customers return to the address they ordered from (fine for a single site)");

      return json({
        success: true,
        ready: false, // A login diagnostic never establishes checkout acceptance.
        apiLogin,
        checkout: "unverified",
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

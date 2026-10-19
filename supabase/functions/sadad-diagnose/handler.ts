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
      let checkoutVerified = false;
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
        const lastPaid = (await deps.repo.lastVerifiedSadadPayment?.().catch(() => null)) ?? null;
        if (lastPaid) {
          checkoutVerified = true;
          const when = new Date(lastPaid.paid_at).toLocaleString("ar-u-nu-latn", { timeZone: "Asia/Qatar", dateStyle: "medium", timeStyle: "short" });
          add("checkout_signature", "ok", `صفحة الدفع تعمل: سداد قبلت توقيع الدفع، وآخر دفعة مؤكَّدة من سداد كانت للحجز ${lastPaid.booking_reference} بتاريخ ${when}.`);
        } else {
          add("checkout_signature", "warn", "صفحة الدفع لم تُثبَت بعد: لا توجد دفعة سداد مؤكَّدة حتى الآن. أجرِ دفعة حقيقية صغيرة للتأكد.");
        }
        add("checkout_format", "warn", "تنسيق txnDate غير متسق بين صفحات توثيق سداد: جدول الحقول يذكر YYYY-MM-DD، بينما نموذج الدفع الرسمي يعرض التاريخ والوقت مثل التنفيذ الحالي. يلزم تأكيد سداد قبل تغيير هذا التنسيق. Checkout يستخدم رابط webpurchase نفسه للاختبار والإنتاج، والبيئة يحددها المفتاح؛ اختيار بيئة API لا يثبت بيئة Checkout.");
      } else {
        add("api_login", "error", "Skipped: complete the settings above first");
      }

      const callbackUrl = settings.websiteDomain ? siteCallbackUrl(settings.websiteDomain) : "(set the website domain)";
      const webhookUrl = `${deps.supabaseUrl.replace(/\/+$/, "")}/functions/v1/sadad-webhook`;
      add("callback_url", "ok", `Customers return from Sadad to: ${callbackUrl}`);
      const lastHook = (await deps.repo.lastWebhookAt?.().catch(() => null)) ?? null;
      if (lastHook) {
        const when = new Date(lastHook).toLocaleString("ar-u-nu-latn", { timeZone: "Asia/Qatar", dateStyle: "medium", timeStyle: "short" });
        add("webhook_registration", "ok", `الـ Webhook مسجّل ويعمل: آخر إشعار وصل من سداد بتاريخ ${when}.`);
      } else {
        add("webhook_registration", "warn", `لم يصل أي إشعار من سداد بعد. سجّل هذا الرابط في لوحة سداد (Payment Gateway → Webhook): ${webhookUrl}`);
      }
      if (settings.webhookUrl) add("automation", "ok", "Automation (n8n) webhook is configured");
      else add("automation", "warn", "No automation (n8n) webhook is configured: tickets will not be sent automatically");

      if (settings.siteUrl) add("site_url", "ok", `Customers are returned to ${settings.siteUrl}`);
      else add("site_url", "warn", "Site URL is not set: customers return to the address they ordered from (fine for a single site)");

      return json({
        success: true,
        // Only a real Sadad-confirmed payment proves checkout acceptance.
        ready: checkoutVerified && apiLogin === "accepted",
        apiLogin,
        checkout: checkoutVerified ? "verified" : "unverified",
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

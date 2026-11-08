// POST /send-to-webhook <json object>   (admins only)
//
// Relays an admin action (send ticket / invoice to WhatsApp, ...) to the
// automation configured in the admin settings. The destination URL never
// leaves the server and only signed-in administrators can use the relay, so
// it cannot be abused to push arbitrary messages through the automation.

import { requireAdmin, type AuthDeps } from "../_shared/auth.ts";
import { HttpError, json, preflight, readJson, toErrorResponse } from "../_shared/http.ts";
import { sendWhatsAppInvoice } from "../_shared/send-whatsapp-invoice.ts";
import type { Repo } from "../_shared/repo.ts";

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;

export interface RelayDeps {
  repo: Repo;
  auth: AuthDeps;
  fetch: typeof fetch;
  timeoutMs?: number;
}

export function sendToWebhookHandler(deps: RelayDeps) {
  return async (req: Request): Promise<Response> => {
    const early = preflight(req);
    if (early) return early;

    try {
      if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST");
      await requireAdmin(req, deps.auth);

      const payload = await readJson(req, 200_000);
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        throw new HttpError(400, "invalid_payload", "Payload must be a JSON object");
      }

      // Legacy ticket/payment triggers must pass the same trusted invoice gate.
      const isEmail = (payload as { action?: unknown }).action === "send_email";
      if (!isEmail) {
        const ref = String((payload as { booking_reference?: unknown }).booking_reference ?? "").trim();
        if (!SAFE_REF.test(ref)) throw new HttpError(400, "invalid_reference", "Invalid booking reference");
        const automatic = (payload as { action?: unknown }).action !== "send_invoice"
          || (payload as { automatic?: unknown }).automatic === true;
        return json(await sendWhatsAppInvoice({ repo: deps.repo, fetch: deps.fetch, reference: ref, automatic, timeoutMs: deps.timeoutMs }));
      }
      const outgoing = payload;

      // e-mails go to their own automation when one is configured
      const settings = await deps.repo.getPrivateSettings();
      const webhookUrl = isEmail ? (settings.emailWebhookUrl ?? settings.webhookUrl) : settings.webhookUrl;
      if (!webhookUrl) {
        throw new HttpError(400, "webhook_not_configured", isEmail ? "Email webhook URL not configured" : "Webhook URL not configured", {
          hint: isEmail
            ? "Please configure the email webhook URL in admin settings"
            : "Please configure the webhook URL in admin settings",
        });
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 10_000);
      try {
        const res = await deps.fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(outgoing),
          signal: controller.signal,
        });
        const text = await res.text();

        if (res.ok) {
          // The automation answers later through n8n-response: show "sending" until it does.
          const pendingMessage = isEmail ? "جاري إرسال البريد الإلكتروني..." : "جاري الإرسال إلى واتساب...";
          const orderId = typeof (payload as { order_id?: unknown }).order_id === "string" ? (payload as { order_id: string }).order_id : null;
          const ref = typeof (payload as { booking_reference?: unknown }).booking_reference === "string"
            ? (payload as { booking_reference: string }).booking_reference
            : null;
          if (orderId || ref) {
            await deps.repo
              .markAutomationPending({ orderId, bookingReference: ref, message: pendingMessage })
              .catch((error) => console.error("could not mark the order as sending", error instanceof Error ? error.message : error));
          }
          return json({ success: true, message: pendingMessage, response: text });
        }

        let details: unknown = text;
        try {
          details = JSON.parse(text);
        } catch {
          /* keep the raw text */
        }
        // 200 on purpose: the admin screen shows the upstream problem instead of a generic failure
        if (res.status === 404) {
          return json({
            error: "Webhook not found or inactive",
            details,
            status: 404,
            solution: "Please ACTIVATE the workflow in n8n (not just test mode).",
          });
        }
        return json({ error: "Webhook returned error", details, status: res.status });
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "AbortError";
        return json({
          error: timedOut ? "Webhook request timed out" : "Webhook request failed",
          details: timedOut ? "The webhook did not respond in time" : "Could not reach the webhook",
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

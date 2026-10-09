// Glue between the pure payment processor and the outside world: the
// repository, Sadad's API and the n8n automation. Used by every endpoint that
// can settle a payment (callback, webhook, verify-payment).

import { postWebhook, buildOrderPaidPayload } from "./notify.ts";
import type { ProcessorDeps } from "./payment-processor.ts";
import type { Repo } from "./repo.ts";
import { lookupTransaction, type SadadApiResult } from "./sadad-api.ts";
import { isSadadConfigured, type PrivateSettings } from "./settings.ts";

export interface WiringArgs {
  repo: Repo;
  settings: PrivateSettings;
  fetch: typeof fetch;
  now?: () => Date;
  /** Fire-and-forget work that must outlive the response. */
  waitUntil?: (work: Promise<unknown>) => void;
}

export function makeProcessorDeps({ repo, settings, fetch: fetchImpl, now, waitUntil }: WiringArgs): ProcessorDeps {
  const configured = isSadadConfigured(settings);

  return {
    getOrder: (ref) => repo.getPaymentOrder(ref),

    lookupSadad: async (ref, transactionNumber): Promise<SadadApiResult> => {
      if (!configured) return { kind: "unavailable", error: "sadad_not_configured" };
      return lookupTransaction({
        fetch: fetchImpl,
        creds: {
          sadadId: settings.merchantId as string,
          secretKey: settings.secret as string,
          domain: settings.websiteDomain as string,
        },
        environment: settings.environment,
        orderRef: ref,
        transactionNumber,
      });
    },

    confirmOrderPayment: (ref, transactionNumber) => repo.confirmOrderPayment(ref, transactionNumber),
    failOrderPayment: (ref, note) => repo.failOrderPayment(ref, note),
    logEvent: (event) => repo.logPaymentEvent(event),

    // Tell the automation (WhatsApp tickets, invoices) exactly once, when WE confirmed the order.
    onConfirmed: async (order) => {
      if (!settings.webhookUrl) return;
      const context = await repo.getOrderContext(order.booking_reference);
      if (!context) return;
      const payload = buildOrderPaidPayload({
        customer: context.customer,
        event: context.event,
        order: context.order,
        holders: context.holders,
        prices: context.prices,
        transactionNumber: (context.order.payment_id as string | null | undefined) ?? null,
        now: now?.(),
      });
      const send = postWebhook(fetchImpl, settings.webhookUrl, payload).then(() => undefined);
      if (waitUntil) waitUntil(send);
      else await send;
    },
  };
}

/**
 * Read what Sadad sent. Callbacks are form POSTs, webhooks are JSON POSTs and a
 * browser redirect may arrive as GET. Only the body is read for POST (query
 * string values cannot be injected into a signed payload).
 */
export async function readPaymentPayload(req: Request, maxChars = 64_000): Promise<Record<string, unknown>> {
  if (req.method === "GET") return Object.fromEntries(new URL(req.url).searchParams);
  if (req.method !== "POST") return {};

  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    return Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  }
  const text = await req.text();
  if (text.length > maxChars) return {};
  if (contentType.includes("json") || text.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

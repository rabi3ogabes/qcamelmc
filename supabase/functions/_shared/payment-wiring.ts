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
  /**
   * Calls another edge function as the service role (invoice e-mail, admin alert,
   * failed-payment e-mail). Left out in tests, and best-effort in production.
   */
  callFunction?: (name: string, body: unknown) => Promise<unknown>;
}

/** Words that mean the customer's bank or card said no (everything else is the gateway). */
const BANK_HINTS = ["card", "بطاقة", "declin", "مرفوض", "insufficient", "رصيد", "bank", "بنك", "issuer", "cvv", "authorization"];

export function failureSource(reason: string): "bank" | "sadad" {
  const text = reason.toLowerCase();
  return BANK_HINTS.some((hint) => text.includes(hint)) ? "bank" : "sadad";
}

export function makeProcessorDeps({ repo, settings, fetch: fetchImpl, now, waitUntil, callFunction }: WiringArgs): ProcessorDeps {
  const configured = isSadadConfigured(settings);

  // Work that follows a payment result must never change the result itself.
  // With a runtime that can finish work after the response (waitUntil) we do not wait for it.
  const background = (work: Promise<unknown>): Promise<unknown> => {
    const guarded = work.catch((error) => console.error("post-payment task failed", error instanceof Error ? error.message : error));
    if (waitUntil) {
      waitUntil(guarded);
      return Promise.resolve();
    }
    return guarded;
  };

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

    // Tell the customer, the admin and the automation (WhatsApp tickets, invoices)
    // exactly once, when WE confirmed the order.
    onConfirmed: async (order) => {
      const tasks: Promise<unknown>[] = [];
      if (callFunction) {
        tasks.push(callFunction("send-invoice-email", { order_id: order.id }));
        tasks.push(callFunction("notify-admin-sale", { order_id: order.id }));
      }
      if (settings.webhookUrl) {
        const context = await repo.getOrderContext(order.booking_reference);
        if (context) {
          const payload = buildOrderPaidPayload({
            customer: context.customer,
            event: context.event,
            order: context.order,
            holders: context.holders,
            prices: context.prices,
            transactionNumber: (context.order.payment_id as string | null | undefined) ?? null,
            now: now?.(),
          });
          tasks.push(postWebhook(fetchImpl, settings.webhookUrl, payload));
        }
      }
      await background(Promise.allSettled(tasks));
    },

    // A closed payment is recorded for the "payment errors" screen and the customer is told.
    onFailed: async (order, reason) => {
      const tasks: Promise<unknown>[] = [];
      tasks.push(
        repo.recordPaymentError({
          order_id: order.id,
          booking_reference: order.booking_reference,
          amount: Number(order.total_amount),
          error_source: failureSource(reason),
          error_code: "PAYMENT_FAILED",
          error_message: reason,
          raw: { source: "payment-processor", reason },
        }),
      );
      if (callFunction) tasks.push(callFunction("send-payment-failed-email", { order_id: order.id }));
      await background(Promise.allSettled(tasks));
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

// AUTO-GENERATED COPY of supabase/functions/_shared/notify.ts — do not edit here.
// Edit the original, then run "npm run sync:functions". Each function ships self-contained.

// Payloads for the n8n automation (WhatsApp tickets / invoices) and the helper
// that posts them. The shapes match what the existing workflow already
// receives; the only addition is qr_code_image (the picture URL).

import { toSadadMobile } from "./sadad-core.ts";

type Row = Record<string, unknown>;

/** Digits only, with the country code (what WhatsApp-style APIs expect). */
export function formatPhone(phone: unknown, countryCode?: unknown): string | null {
  const raw = typeof phone === "string" ? phone.trim() : "";
  if (!raw) return null;
  const cc = typeof countryCode === "string" && countryCode.trim() ? countryCode : "+974";
  return toSadadMobile(raw, cc);
}

// `qr_code` is the scannable ticket code; the picture travels separately as
// `qr_code_image` (the same convention the admin "send ticket" actions use).
const qrFields = (h: Row) => ({
  qr_code: h.qr_code as string,
  qr_code_image: (h.qr_image_url as string | null | undefined) ?? null,
});
export interface OrderCreatedInput {
  customer: Row;
  order: Row;
  holders: Row[];
  adminPhone: string | null | undefined;
  now?: Date;
}

export function buildOrderCreatedPayload(input: OrderCreatedInput) {
  const { customer, order, holders } = input;
  return {
    customer: { ...customer, phone: formatPhone(customer.phone, customer.country_code) },
    order,
    ticketHolders: holders.map((h) => ({
      ...h,
      phone: formatPhone(h.phone, h.country_code),
      ...qrFields(h),
    })),
    bookingReference: order.booking_reference as string,
    adminPhone: formatPhone(input.adminPhone, "+974"),
    timestamp: (input.now ?? new Date()).toISOString(),
  };
}

export interface OrderPaidInput {
  customer: Row;
  event: Row;
  order: Row;
  holders: Row[];
  prices: Record<string, number>;
  transactionNumber?: string | null;
  now?: Date;
}

/**
 * The message sent when an order is paid. It is the shape the admin "confirm
 * payment" button has always sent to the workflow: the order row with its
 * customers / events / ticket_holders attached and `action: "payment_confirmed"`.
 * There, `qr_code` is the picture URL when one exists (that is what the workflow
 * reads); `qr_code_text` and `qr_code_image` are the explicit forms.
 */
export function buildOrderPaidPayload(input: OrderPaidInput) {
  const { order, holders, prices } = input;
  return {
    ...order,
    customers: input.customer,
    events: input.event,
    ticket_holders: holders.map((h) => {
      const image = (h.qr_image_url as string | null | undefined) ?? null;
      return {
        ...h,
        ticket_price: prices[String(h.ticket_type)] ?? 0,
        qr_code: image ?? (h.qr_code as string),
        qr_code_text: h.qr_code as string,
        qr_code_image: image,
        phone_international: formatPhone(h.phone, h.country_code),
      };
    }),
    // singular aliases for consumers written against an older shape
    customer: input.customer,
    event: input.event,
    sadad_response: input.transactionNumber ? { transaction_number: input.transactionNumber } : null,
    action: "payment_confirmed",
    timestamp: (input.now ?? new Date()).toISOString(),
  };
}
export type WebhookResult = { ok: true; status: number } | { ok: false; status?: number; error?: string };

/** POST JSON to the configured automation. Never throws. */
export async function postWebhook(
  fetchImpl: typeof fetch,
  url: string,
  body: unknown,
  timeoutMs = 8000,
): Promise<WebhookResult> {
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "invalid_webhook_url" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "request_failed" };
  } finally {
    clearTimeout(timer);
  }
}

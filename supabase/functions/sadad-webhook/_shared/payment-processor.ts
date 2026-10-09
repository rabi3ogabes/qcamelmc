// AUTO-GENERATED COPY of supabase/functions/_shared/payment-processor.ts — do not edit here.
// Edit the original, then run "npm run sync:functions". Each function ships self-contained.

// Applies a payment notification (browser callback, server webhook, polling or
// an admin's "verify" click) to an order. Everything external is injected, so
// the whole decision path is unit-testable without Deno, Supabase or Sadad.
//
// The notification itself is only a *trigger*: before an order is marked paid
// we ask Sadad's API (see payment-decision.ts for the exact rules).

import { decidePayment, type Decision, type OrderStatus } from "./payment-decision.ts";
import type { SadadApiResult } from "./sadad-api.ts";
import type { NormalizedPayment } from "./sadad-core.ts";

export interface PaymentOrder {
  id: string;
  booking_reference: string;
  total_amount: number;
  payment_status: OrderStatus;
  return_origin?: string | null;
}

export type PaymentSource = "callback" | "webhook" | "poll" | "admin";

export interface PaymentEvent {
  booking_reference: string;
  order_id: string | null;
  source: PaymentSource;
  payload: unknown;
  checksum_valid: boolean;
  api_result: string | null;
  decision: string;
  outcome: string;
}

export interface ProcessorDeps {
  getOrder(ref: string): Promise<PaymentOrder | null>;
  lookupSadad(ref: string, transactionNumber: string | null): Promise<SadadApiResult>;
  confirmOrderPayment(ref: string, transactionNumber: string): Promise<{ result: string }>;
  failOrderPayment(ref: string, note: string): Promise<{ result: string }>;
  logEvent(event: PaymentEvent): Promise<void>;
  /** Called once, only when this call is the one that confirmed the order. */
  onConfirmed?(order: PaymentOrder): Promise<void>;
}

export interface ProcessInput {
  orderRef: string;
  payload: NormalizedPayment | null;
  rawPayload: unknown;
  checksumValid: boolean;
  source: PaymentSource;
}

export interface ProcessOutcome {
  outcome: string;
  decision: Decision | null;
  order: PaymentOrder | null;
}

const MAX_STORED_PAYLOAD_CHARS = 4000;

/** Untrusted input must never bloat the audit table. */
function boundedPayload(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  try {
    const text = JSON.stringify(raw);
    if (text.length <= MAX_STORED_PAYLOAD_CHARS) return raw;
    return { truncated: true, preview: text.slice(0, MAX_STORED_PAYLOAD_CHARS) };
  } catch {
    return { unserialisable: true };
  }
}

export async function processPayment(input: ProcessInput, deps: ProcessorDeps): Promise<ProcessOutcome> {
  const log = async (event: Omit<PaymentEvent, "payload" | "booking_reference" | "source" | "checksum_valid">) => {
    try {
      await deps.logEvent({
        booking_reference: input.orderRef,
        source: input.source,
        payload: boundedPayload(input.rawPayload),
        checksum_valid: input.checksumValid,
        ...event,
      });
    } catch (error) {
      console.error("payment audit log failed", error instanceof Error ? error.message : error);
    }
  };

  const order = await deps.getOrder(input.orderRef);
  if (!order) {
    await log({ order_id: null, api_result: null, decision: "none", outcome: "order_not_found" });
    return { outcome: "order_not_found", decision: null, order: null };
  }

  if (order.payment_status === "confirmed") {
    await log({ order_id: order.id, api_result: null, decision: "noop", outcome: "noop" });
    return { outcome: "noop", decision: { action: "noop", reason: "already_confirmed" }, order };
  }

  const api = await deps.lookupSadad(order.booking_reference, input.payload?.transactionNumber ?? null);

  const decision = decidePayment({
    orderRef: order.booking_reference,
    orderTotal: Number(order.total_amount),
    orderStatus: order.payment_status,
    payload: input.payload,
    checksumValid: input.checksumValid,
    api,
  });

  let outcome: string = decision.action;
  if (decision.action === "confirm") {
    const { result } = await deps.confirmOrderPayment(order.booking_reference, decision.transactionNumber);
    outcome = result;
    if (result === "confirmed" && deps.onConfirmed) {
      try {
        await deps.onConfirmed({ ...order, payment_status: "confirmed" });
      } catch (error) {
        console.error("post-confirmation hook failed", error instanceof Error ? error.message : error);
      }
    }
  } else if (decision.action === "fail") {
    const { result } = await deps.failOrderPayment(order.booking_reference, decision.reason);
    outcome = result === "failed" ? "failed" : result;
  }

  await log({ order_id: order.id, api_result: api.kind, decision: decision.action, outcome });
  return { outcome, decision, order };
}

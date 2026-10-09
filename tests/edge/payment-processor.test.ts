import { describe, expect, it } from "vitest";
import {
  processPayment,
  type PaymentEvent,
  type PaymentOrder,
  type ProcessorDeps,
} from "../../supabase/functions/_shared/payment-processor.ts";
import type { SadadApiResult } from "../../supabase/functions/_shared/sadad-api.ts";
import type { NormalizedPayment } from "../../supabase/functions/_shared/sadad-core.ts";

const REF = "QTR-ABC123DEF456";

const order = (over: Partial<PaymentOrder> = {}): PaymentOrder => ({
  id: "order-1",
  booking_reference: REF,
  total_amount: 150,
  payment_status: "pending",
  ...over,
});

const payload = (over: Partial<NormalizedPayment> = {}): NormalizedPayment => ({
  orderRef: REF,
  transactionNumber: "SD1",
  status: "success",
  amount: 150,
  sandbox: false,
  ...over,
});

function harness(opts: {
  order?: PaymentOrder | null;
  api?: SadadApiResult;
  confirmResult?: string;
  failResult?: string;
}) {
  const calls = { confirm: [] as unknown[][], fail: [] as unknown[][], lookups: [] as unknown[][], notified: [] as string[] };
  const events: PaymentEvent[] = [];
  const deps: ProcessorDeps = {
    getOrder: async () => (opts.order === undefined ? order() : opts.order),
    confirmOrderPayment: async (...args) => {
      calls.confirm.push(args);
      return { result: opts.confirmResult ?? "confirmed" };
    },
    failOrderPayment: async (...args) => {
      calls.fail.push(args);
      return { result: opts.failResult ?? "failed" };
    },
    lookupSadad: async (...args) => {
      calls.lookups.push(args);
      return opts.api ?? { kind: "not_found" };
    },
    logEvent: async (e) => {
      events.push(e);
    },
    onConfirmed: async (o) => {
      calls.notified.push(o.booking_reference);
    },
  };
  return { deps, calls, events };
}

const run = (h: ReturnType<typeof harness>, over: Record<string, unknown> = {}) =>
  processPayment(
    { orderRef: REF, payload: null, rawPayload: null, checksumValid: false, source: "callback", ...over } as never,
    h.deps,
  );

describe("processPayment", () => {
  it("confirms an order Sadad reports as paid, and notifies exactly once", async () => {
    const h = harness({ api: { kind: "success", transactionNumber: "SD1", amount: 150, websiteRefNo: REF, sandbox: false } });
    const out = await run(h);
    expect(out.outcome).toBe("confirmed");
    expect(h.calls.confirm).toEqual([[REF, "SD1"]]);
    expect(h.calls.notified).toEqual([REF]);
  });

  it("asks Sadad about the order, passing the transaction number from the payload", async () => {
    const h = harness({ api: { kind: "not_found" } });
    await run(h, { payload: payload() });
    expect(h.calls.lookups).toEqual([[REF, "SD1"]]);
  });

  it("does not notify when the database says it was already confirmed", async () => {
    const h = harness({
      api: { kind: "success", transactionNumber: "SD1", amount: 150, websiteRefNo: REF, sandbox: false },
      confirmResult: "already_confirmed",
    });
    const out = await run(h);
    expect(out.outcome).toBe("already_confirmed");
    expect(h.calls.notified).toEqual([]);
  });

  it("never touches an order that is already confirmed (and does not call Sadad)", async () => {
    const h = harness({ order: order({ payment_status: "confirmed" }) });
    const out = await run(h, { payload: payload(), checksumValid: true });
    expect(out.outcome).toBe("noop");
    expect(h.calls.lookups).toEqual([]);
    expect(h.calls.confirm).toEqual([]);
  });

  it("ignores a forged success callback that Sadad has no record of", async () => {
    const h = harness({ api: { kind: "not_found" } });
    const out = await run(h, { payload: payload(), checksumValid: false });
    expect(out.outcome).toBe("pending");
    expect(h.calls.confirm).toEqual([]);
  });

  it("flags an unverifiable success for staff when Sadad cannot be reached", async () => {
    const h = harness({ api: { kind: "unavailable", error: "down" } });
    const out = await run(h, { payload: payload(), checksumValid: false });
    expect(out.outcome).toBe("review");
    expect(h.calls.confirm).toEqual([]);
  });

  it("does not confirm on a correctly signed callback when Sadad cannot be reached (staff review)", async () => {
    const h = harness({ api: { kind: "unavailable", error: "down" } });
    const out = await run(h, { payload: payload(), checksumValid: true });
    expect(out.outcome).toBe("review");
    expect(h.calls.confirm).toEqual([]);
  });

  it("fails the order when Sadad reports a failed transaction", async () => {
    const h = harness({ api: { kind: "failed", transactionNumber: "SD2" } });
    const out = await run(h);
    expect(out.outcome).toBe("failed");
    expect(h.calls.fail).toHaveLength(1);
  });

  it("cannot be used to cancel an order with an unsigned failure message", async () => {
    const h = harness({ api: { kind: "unavailable", error: "down" } });
    const out = await run(h, { payload: payload({ status: "failed" }), checksumValid: false });
    expect(out.outcome).toBe("pending");
    expect(h.calls.fail).toEqual([]);
  });

  it("reports an unknown order without throwing", async () => {
    const h = harness({ order: null });
    const out = await run(h);
    expect(out.outcome).toBe("order_not_found");
    expect(h.calls.lookups).toEqual([]);
  });

  it("surfaces a late payment with no seats left for staff", async () => {
    const h = harness({
      order: order({ payment_status: "failed" }),
      api: { kind: "success", transactionNumber: "SD9", amount: 150, websiteRefNo: REF, sandbox: false },
      confirmResult: "paid_after_expiry_no_stock",
    });
    const out = await run(h);
    expect(out.outcome).toBe("paid_after_expiry_no_stock");
    expect(h.calls.notified).toEqual([]);
  });

  it("writes an audit event for every call, with the evidence and the decision", async () => {
    const h = harness({ api: { kind: "success", transactionNumber: "SD1", amount: 150, websiteRefNo: REF, sandbox: false } });
    await run(h, { payload: payload(), rawPayload: { ORDERID: REF }, checksumValid: true, source: "webhook" });
    expect(h.events).toHaveLength(1);
    expect(h.events[0]).toMatchObject({
      booking_reference: REF,
      source: "webhook",
      checksum_valid: true,
      api_result: "success",
      decision: "confirm",
      outcome: "confirmed",
    });
    expect(h.events[0].payload).toEqual({ ORDERID: REF });
  });

  it("still returns a result when logging or notifying fails", async () => {
    const h = harness({ api: { kind: "success", transactionNumber: "SD1", amount: 150, websiteRefNo: REF, sandbox: false } });
    h.deps.logEvent = async () => {
      throw new Error("db down");
    };
    h.deps.onConfirmed = async () => {
      throw new Error("n8n down");
    };
    const out = await run(h);
    expect(out.outcome).toBe("confirmed");
  });

  it("caps the size of what it stores from an untrusted payload", async () => {
    const h = harness({ api: { kind: "not_found" } });
    await run(h, { rawPayload: { junk: "x".repeat(50_000) } });
    expect(JSON.stringify(h.events[0].payload).length).toBeLessThan(8_100);
  });
});

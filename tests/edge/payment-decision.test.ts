import { describe, expect, it } from "vitest";
import { decidePayment } from "../../supabase/functions/_shared/payment-decision.ts";
import type { SadadApiResult } from "../../supabase/functions/_shared/sadad-api.ts";
import type { NormalizedPayment } from "../../supabase/functions/_shared/sadad-core.ts";

const REF = "QTR-ABC123DEF456";

const payload = (over: Partial<NormalizedPayment> = {}): NormalizedPayment => ({
  orderRef: REF,
  transactionNumber: "SD1",
  status: "success",
  amount: 150,
  sandbox: false,
  ...over,
});

const apiSuccess = (over: Record<string, unknown> = {}): SadadApiResult => ({
  kind: "success",
  transactionNumber: "SD1",
  amount: 150,
  websiteRefNo: REF,
  sandbox: false,
  ...over,
} as SadadApiResult);

const base = { orderRef: REF, orderTotal: 150, orderStatus: "pending" as const };

describe("decidePayment", () => {
  it("confirms when Sadad's own API says the order was paid in full", () => {
    const d = decidePayment({ ...base, payload: payload(), checksumValid: false, api: apiSuccess() });
    expect(d).toMatchObject({ action: "confirm", via: "api", transactionNumber: "SD1" });
  });

  it("confirms from the API even if the browser callback is missing or forged", () => {
    expect(decidePayment({ ...base, payload: null, checksumValid: false, api: apiSuccess() }).action).toBe("confirm");
    expect(
      decidePayment({ ...base, payload: payload({ status: "failed" }), checksumValid: false, api: apiSuccess() }).action,
    ).toBe("confirm");
  });

  it("does not confirm when the API shows a different amount than the order", () => {
    const d = decidePayment({ ...base, payload: null, checksumValid: false, api: apiSuccess({ amount: 1 }) });
    expect(d.action).toBe("review");
  });

  it("sends an amount disagreement to staff even when the signed callback states the right amount", () => {
    const d = decidePayment({
      ...base,
      payload: payload(),
      checksumValid: true,
      api: apiSuccess({ amount: 150.5 }),
    });
    expect(d).toMatchObject({ action: "review", reason: "amount_mismatch" });
  });

  it("rejects a transaction that Sadad attributes to another order", () => {
    const d = decidePayment({ ...base, payload: null, checksumValid: false, api: apiSuccess({ websiteRefNo: "QTR-OTHER" }) });
    expect(d.action).toBe("pending");
  });

  it("never confirms on a correctly signed callback alone, even when the API is unreachable", () => {
    const d = decidePayment({
      ...base,
      payload: payload(),
      checksumValid: true,
      api: { kind: "unavailable", error: "down" },
    });
    expect(d.action).toBe("review");
  });

  it("never confirms on a valid checksum when Sadad has no such transaction (forged callback)", () => {
    const d = decidePayment({ ...base, payload: payload(), checksumValid: true, api: { kind: "not_found" } });
    expect(d.action).toBe("pending");
  });

  it("never confirms on a valid checksum while the payment is still in progress", () => {
    const d = decidePayment({ ...base, payload: payload(), checksumValid: true, api: { kind: "in_progress" } });
    expect(d.action).toBe("pending");
  });

  it("never confirms when the API was not consulted at all", () => {
    expect(decidePayment({ ...base, payload: payload(), checksumValid: true, api: null }).action).toBe("review");
  });

  it("does NOT confirm an unsigned success claim when the API is unreachable", () => {
    const d = decidePayment({
      ...base,
      payload: payload(),
      checksumValid: false,
      api: { kind: "unavailable", error: "down" },
    });
    expect(d.action).toBe("review");
  });

  it("does NOT confirm an unsigned success claim that Sadad does not know about", () => {
    const d = decidePayment({ ...base, payload: payload(), checksumValid: false, api: { kind: "not_found" } });
    expect(d.action).toBe("pending");
  });

  it("does not confirm a signed callback whose amount differs from the order", () => {
    const d = decidePayment({
      ...base,
      payload: payload({ amount: 1 }),
      checksumValid: true,
      api: { kind: "unavailable", error: "down" },
    });
    expect(d.action).toBe("review");
  });

  it("fails the order only on trusted evidence of failure", () => {
    expect(decidePayment({ ...base, payload: null, checksumValid: false, api: { kind: "failed", transactionNumber: "SD1" } }).action).toBe("fail");
    expect(
      decidePayment({ ...base, payload: payload({ status: "failed" }), checksumValid: true, api: { kind: "unavailable", error: "x" } }).action,
    ).toBe("pending"); // a signed failure message alone is not enough: the order simply expires
  });

  it("ignores an unsigned failure claim (cannot be used to cancel someone's order)", () => {
    const d = decidePayment({
      ...base,
      payload: payload({ status: "failed" }),
      checksumValid: false,
      api: { kind: "unavailable", error: "x" },
    });
    expect(d.action).toBe("pending");
  });

  it("stays pending while the payment is in progress", () => {
    expect(decidePayment({ ...base, payload: null, checksumValid: false, api: { kind: "in_progress" } }).action).toBe("pending");
  });

  it("is a no-op for an order that is already confirmed", () => {
    const d = decidePayment({ ...base, orderStatus: "confirmed", payload: payload(), checksumValid: true, api: apiSuccess() });
    expect(d).toMatchObject({ action: "noop", reason: "already_confirmed" });
  });

  it("can still confirm an order that expired while the customer was paying", () => {
    const d = decidePayment({ ...base, orderStatus: "failed", payload: null, checksumValid: false, api: apiSuccess() });
    expect(d.action).toBe("confirm");
  });

  it("needs a transaction number to confirm", () => {
    const d = decidePayment({
      ...base,
      payload: payload({ transactionNumber: null }),
      checksumValid: true,
      api: { kind: "unavailable", error: "x" },
    });
    expect(d.action).toBe("review");
  });
});

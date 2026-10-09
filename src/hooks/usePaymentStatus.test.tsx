// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePaymentStatus } from "./usePaymentStatus";
import type { ApiResult, OrderStatus, VerifyResult } from "@/lib/api-client";

const order = (over: Partial<OrderStatus> = {}): OrderStatus => ({
  booking_reference: "QTR-A",
  payment_status: "pending",
  payment_method: "sadad",
  total_amount: 150,
  quantity: 1,
  ticket_type: "vip",
  created_at: "2026-10-09T10:00:00Z",
  payment_expires_at: null,
  event_id: "event-1",
  event: { title: "Festival", event_date: "2026-12-18", location: "Doha" },
  tickets: [],
  ...over,
});

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data });
const verified = (status: OrderStatus["payment_status"], checked = true): ApiResult<VerifyResult> =>
  ok({ success: true, checked, payment_status: status });

/** Scripted backend: statuses are consumed in order, the last one repeats. */
function fakeApi(statuses: (OrderStatus | null | "error")[], verify: (n: number) => ApiResult<VerifyResult> = () => verified("pending")) {
  let reads = 0;
  let verifies = 0;
  return {
    api: {
      getOrderStatuses: vi.fn(async () => {
        const next = statuses[Math.min(reads++, statuses.length - 1)];
        if (next === "error") return { ok: false, error: { code: "network_error", message: "x" } } as ApiResult<OrderStatus[]>;
        return ok(next ? [next] : []);
      }),
      verifyPayment: vi.fn(async () => verify(++verifies)),
    },
    get verifies() {
      return verifies;
    },
  };
}

const options = { pollMs: 3000, verifyMs: 12_000, timeoutMs: 60_000 };
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePaymentStatus", () => {
  it("shows success straight away for an order that is already confirmed, without asking Sadad", async () => {
    const f = fakeApi([order({ payment_status: "confirmed" })]);
    const { result } = renderHook(() => usePaymentStatus("QTR-A", { api: f.api, ...options }));
    await settle();
    expect(result.current.phase).toBe("confirmed");
    expect(result.current.order?.booking_reference).toBe("QTR-A");
    expect(f.api.verifyPayment).not.toHaveBeenCalled();
  });

  it("asks the server to verify with Sadad right away, then shows success once it is confirmed", async () => {
    const f = fakeApi([order(), order({ payment_status: "confirmed" })], () => verified("confirmed"));
    const { result } = renderHook(() => usePaymentStatus("QTR-A", { api: f.api, ...options }));
    expect(result.current.phase).toBe("checking");
    await settle();
    expect(f.api.verifyPayment).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("confirmed");
  });

  it("keeps polling a pending order, verifies only every 12 seconds, and gives up politely after a minute", async () => {
    const f = fakeApi([order()]);
    const { result } = renderHook(() => usePaymentStatus("QTR-A", { api: f.api, ...options }));
    await settle();
    expect(f.verifies).toBe(1);
    await advance(11_000);
    expect(f.verifies).toBe(1);
    await advance(2_000); // t = 13s
    expect(f.verifies).toBe(2);
    await advance(11_000); // t = 24s
    expect(f.verifies).toBe(3);
    expect(result.current.phase).toBe("checking");
    await advance(40_000); // t = 64s > timeout
    expect(result.current.phase).toBe("delayed");
    const reads = f.api.getOrderStatuses.mock.calls.length;
    await advance(30_000);
    expect(f.api.getOrderStatuses.mock.calls.length).toBe(reads); // stopped polling
  });

  it("double-checks a failed/expired order with Sadad once, because the customer may have paid late", async () => {
    const f = fakeApi([order({ payment_status: "failed" })]);
    const { result } = renderHook(() => usePaymentStatus("QTR-A", { api: f.api, ...options }));
    await settle();
    expect(f.verifies).toBe(1);
    expect(result.current.phase).toBe("failed");
  });

  it("recovers a late payment on an expired order", async () => {
    const f = fakeApi([order({ payment_status: "failed" }), order({ payment_status: "confirmed" })], () => verified("confirmed"));
    const { result } = renderHook(() => usePaymentStatus("QTR-A", { api: f.api, ...options }));
    await settle();
    expect(result.current.phase).toBe("confirmed");
  });

  it("treats an order cancelled by staff as final, without asking Sadad", async () => {
    const f = fakeApi([order({ payment_status: "cancelled" })]);
    const { result } = renderHook(() => usePaymentStatus("QTR-A", { api: f.api, ...options }));
    await settle();
    expect(result.current.phase).toBe("failed");
    expect(f.api.verifyPayment).not.toHaveBeenCalled();
  });

  it("recognises a cash-at-venue booking (nothing to wait for)", async () => {
    const f = fakeApi([order({ payment_method: "cash_pos" })]);
    const { result } = renderHook(() => usePaymentStatus("QTR-A", { api: f.api, ...options }));
    await settle();
    expect(result.current.phase).toBe("cash");
    expect(f.api.verifyPayment).not.toHaveBeenCalled();
  });

  it("reports an unknown reference, and a missing one", async () => {
    const unknownApi = fakeApi([null]).api;
    const unknown = renderHook(() => usePaymentStatus("QTR-NOPE", { api: unknownApi, ...options }));
    await settle();
    expect(unknown.result.current.phase).toBe("not_found");
    const noneApi = fakeApi([null]).api;
    const none = renderHook(() => usePaymentStatus(null, { api: noneApi, ...options }));
    await settle();
    expect(none.result.current.phase).toBe("not_found");
  });

  it("retries after a temporary network error instead of showing a failure", async () => {
    const f = fakeApi(["error", "error", order({ payment_status: "confirmed" })]);
    const { result } = renderHook(() => usePaymentStatus("QTR-A", { api: f.api, ...options }));
    await settle();
    expect(result.current.phase).toBe("checking");
    await advance(6_500);
    expect(result.current.phase).toBe("confirmed");
  });

  it("lets the customer check again after the wait ran out", async () => {
    let status = order();
    const api = {
      getOrderStatuses: vi.fn(async () => ok([status])),
      verifyPayment: vi.fn(async () => verified("pending")),
    };
    const { result } = renderHook(() => usePaymentStatus("QTR-A", { api, ...options }));
    await settle();
    await advance(65_000);
    expect(result.current.phase).toBe("delayed");

    status = order({ payment_status: "confirmed" }); // the payment landed in the meantime
    act(() => result.current.checkAgain());
    expect(result.current.phase).toBe("checking");
    await advance(1_000);
    expect(result.current.phase).toBe("confirmed");
  });
  it("stops everything when the page is left", async () => {
    const f = fakeApi([order()]);
    const { unmount } = renderHook(() => usePaymentStatus("QTR-A", { api: f.api, ...options }));
    await settle();
    unmount();
    const reads = f.api.getOrderStatuses.mock.calls.length;
    await advance(30_000);
    expect(f.api.getOrderStatuses.mock.calls.length).toBe(reads);
  });
});

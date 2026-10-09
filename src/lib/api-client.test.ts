import { describe, expect, it } from "vitest";
import { apiErrorMessage, createApi, type ApiError } from "./api-client";

const httpError = (status: number, body: unknown) => ({
  name: "FunctionsHttpError",
  message: "Edge Function returned a non-2xx status code",
  context: new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
});

function fakeClient(opts: {
  invoke?: (name: string, options: { body?: unknown }) => Promise<{ data: unknown; error: unknown }>;
  rpc?: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
} = {}) {
  const calls: { fn: string; body?: unknown; args?: unknown }[] = [];
  const client = {
    functions: {
      invoke: async (name: string, options: { body?: unknown }) => {
        calls.push({ fn: name, body: options.body });
        return opts.invoke ? opts.invoke(name, options) : { data: { success: true }, error: null };
      },
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return opts.rpc ? opts.rpc(fn, args) : { data: null, error: null };
    },
  };
  return { client: client as never, calls };
}

describe("createApi.createOrder", () => {
  it("sends the order to the create-order function and returns the response", async () => {
    const { client, calls } = fakeClient({
      invoke: async () => ({ data: { success: true, order: { booking_reference: "QTR-A" }, payment: { url: "https://sadad", fields: { a: "1" } } }, error: null }),
    });
    const result = await createApi(client).createOrder({ items: [] } as never);
    expect(result).toMatchObject({ ok: true, data: { order: { booking_reference: "QTR-A" }, payment: { url: "https://sadad" } } });
    expect(calls[0]).toMatchObject({ fn: "create-order", body: { items: [] } });
  });

  it("surfaces the server's error code, status and details", async () => {
    const { client } = fakeClient({
      invoke: async () => ({
        data: null,
        error: httpError(409, { success: false, code: "insufficient_stock", error: "Not enough tickets left", ticket_type: "vip" }),
      }),
    });
    const result = await createApi(client).createOrder({} as never);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "insufficient_stock",
        message: "Not enough tickets left",
        status: 409,
        details: { success: false, code: "insufficient_stock", error: "Not enough tickets left", ticket_type: "vip" },
      },
    });
  });

  it("copes with an error body that is not JSON", async () => {
    const { client } = fakeClient({ invoke: async () => ({ data: null, error: httpError(502, "<html>Bad gateway</html>") }) });
    const result = await createApi(client).createOrder({} as never);
    expect(result).toMatchObject({ ok: false, error: { code: "request_failed", status: 502 } });
  });

  it("reports a network failure distinctly", async () => {
    const { client } = fakeClient({ invoke: async () => ({ data: null, error: { name: "FunctionsFetchError", message: "Failed to send a request" } }) });
    const result = await createApi(client).createOrder({} as never);
    expect(result).toMatchObject({ ok: false, error: { code: "network_error" } });
  });

  it("never throws, even if the client does", async () => {
    const { client } = fakeClient({ invoke: async () => { throw new Error("boom"); } });
    expect(await createApi(client).createOrder({} as never)).toMatchObject({ ok: false, error: { code: "network_error" } });
  });
});

describe("createApi other calls", () => {
  it("restartPayment and verifyPayment send only the booking reference", async () => {
    const { client, calls } = fakeClient();
    const api = createApi(client);
    await api.restartPayment("QTR-A");
    await api.verifyPayment("QTR-A");
    expect(calls).toEqual([
      { fn: "sadad-payment", body: { booking_reference: "QTR-A" } },
      { fn: "verify-payment", body: { booking_reference: "QTR-A" } },
    ]);
  });

  it("getOrderStatuses calls the database function with the references", async () => {
    const { client, calls } = fakeClient({ rpc: async () => ({ data: [{ booking_reference: "QTR-A", payment_status: "confirmed" }], error: null }) });
    const result = await createApi(client).getOrderStatuses(["QTR-A"]);
    expect(result).toEqual({ ok: true, data: [{ booking_reference: "QTR-A", payment_status: "confirmed" }] });
    expect(calls[0]).toEqual({ fn: "get_order_status", args: { p_refs: ["QTR-A"] } });
  });

  it("getOrderStatuses skips the call when there is nothing to look up", async () => {
    const { client, calls } = fakeClient();
    expect(await createApi(client).getOrderStatuses([])).toEqual({ ok: true, data: [] });
    expect(calls).toEqual([]);
  });

  it("getOrderStatuses reports a database error", async () => {
    const { client } = fakeClient({ rpc: async () => ({ data: null, error: { message: "permission denied" } }) });
    expect(await createApi(client).getOrderStatuses(["QTR-A"])).toMatchObject({ ok: false, error: { code: "rpc_failed" } });
  });

  it("cancelOrder returns the outcome and maps 'forbidden'", async () => {
    const ok = fakeClient({ rpc: async () => ({ data: { result: "cancelled" }, error: null }) });
    expect(await createApi(ok.client).cancelOrder("o1", "note")).toEqual({ ok: true, data: { result: "cancelled" } });
    expect(ok.calls[0]).toEqual({ fn: "cancel_order", args: { p_order_id: "o1", p_note: "note" } });

    const denied = fakeClient({ rpc: async () => ({ data: null, error: { message: "forbidden" } }) });
    expect(await createApi(denied.client).cancelOrder("o1")).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});

describe("createApi.createOrder (staff point of sale)", () => {
  it("sends the cashier, the team passcode and each holder's own country code, and nothing about money", async () => {
    const { client, calls } = fakeClient({
      invoke: async () => ({ data: { success: true, order: { booking_reference: "POS-1-1-2027-AAAAAAAAAAAA" } }, error: null }),
    });
    await createApi(client).createOrder({
      source: "pos",
      payment_method: "cash_pos",
      customer: { name: "Ali", email: "", phone: "5551", country_code: "+974", nationality: "قطر", id_number: "123456" },
      items: [{ ticket_id: "t1", quantity: 1 }],
      holders: [{ ticket_id: "t1", name: "Ali", phone: "5551", country_code: "+966", nationality: "قطر", id_number: "123456" }],
      pos_user_id: "cashier-1",
      staff_passcode: "gate-team-7Qx!2",
    });
    expect(calls[0].fn).toBe("create-order");
    expect(calls[0].body).toMatchObject({ source: "pos", pos_user_id: "cashier-1", staff_passcode: "gate-team-7Qx!2" });
    expect((calls[0].body as { holders: { country_code: string }[] }).holders[0].country_code).toBe("+966");
    expect(JSON.stringify(calls[0].body)).not.toMatch(/total|price|amount|payment_status/);
  });

  it("keeps the server's message for a refused order so the cashier can read it out", async () => {
    const { client } = fakeClient({
      invoke: async () => ({ data: null, error: httpError(422, { success: false, code: "ticket_limit_exceeded", error: "الحد الأقصى هو 5 تذاكر" }) }),
    });
    const result = await createApi(client).createOrder({
      customer: { name: "Ali", email: "", phone: "5551", country_code: "+974", nationality: "قطر", id_number: "123456" },
      items: [],
      holders: [],
      payment_method: "cash_pos",
    });
    expect(result).toMatchObject({ ok: false, error: { status: 422, code: "ticket_limit_exceeded", message: "الحد الأقصى هو 5 تذاكر" } });
    if (result.ok === false) expect(apiErrorMessage(result.error, (_key, options) => options?.defaultValue ?? "")).toBe("الحد الأقصى هو 5 تذاكر");
  });
});

describe("apiErrorMessage", () => {
  const t = (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key;
  const err = (code: string, extra: Partial<ApiError> = {}): ApiError => ({ code, message: "m", ...extra });

  it.each([
    ["insufficient_stock", /لم تعد/],
    ["quantity_limit_exceeded", /الحد الأقصى/],
    ["below_minimum_amount", /3/],
    ["event_not_available", /غير متاحة/],
    ["too_many_pending_orders", /حجوزات/],
    ["payment_unavailable", /الدفع الإلكتروني/],
    ["network_error", /الاتصال/],
  ])("has a specific Arabic message for %s", (code, pattern) => {
    expect(apiErrorMessage(err(code), t)).toMatch(pattern);
  });

  it("names the ticket type that sold out", () => {
    expect(apiErrorMessage(err("insufficient_stock", { details: { ticket_type: "vip" } }), t)).toContain("VIP");
  });

  it("falls back to a friendly generic message and never shows server internals", () => {
    const msg = apiErrorMessage(err("internal_error", { message: "relation \"orders\" does not exist" }), t);
    expect(msg).toMatch(/حدث خطأ/);
    expect(msg).not.toContain("orders");
  });
});

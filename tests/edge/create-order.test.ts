import { describe, expect, it } from "vitest";
import { createOrderHandler } from "../../supabase/functions/create-order/handler.ts";
import { HttpError } from "../../supabase/functions/_shared/http.ts";
import { mapOrderError } from "../../supabase/functions/_shared/order-errors.ts";
import { SUPABASE_URL, T1, configuredSettings, fakeStorage, fn, makeRepo, post, validBody } from "./helpers.ts";

function setup(repoOver: Parameters<typeof makeRepo>[0] = {}, extra: Partial<Parameters<typeof createOrderHandler>[0]> = {}) {
  const repo = makeRepo(repoOver);
  const storage = fakeStorage();
  const waited: Promise<unknown>[] = [];
  const webhookCalls: { url: string; body: unknown }[] = [];
  const handler = createOrderHandler({
    repo,
    auth: repo,
    storage,
    generateQr: async (text) => new TextEncoder().encode(text),
    fetch: (async (url: RequestInfo | URL, init?: RequestInit) => {
      webhookCalls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response("ok");
    }) as typeof fetch,
    supabaseUrl: SUPABASE_URL,
    waitUntil: (p) => void waited.push(p),
    now: () => new Date("2026-10-09T10:00:00Z"),
    ...extra,
  });
  return { repo, storage, handler, waited, webhookCalls };
}

const call = (handler: ReturnType<typeof setup>["handler"], body: unknown, headers: Record<string, string> = {}) =>
  handler(post(fn("create-order"), body, headers));

describe("create-order handler", () => {
  it("answers CORS preflight and rejects other methods", async () => {
    const { handler } = setup();
    expect((await handler(new Request(fn("create-order"), { method: "OPTIONS" }))).status).toBe(204);
    expect((await handler(new Request(fn("create-order"), { method: "GET" }))).status).toBe(405);
  });

  it("rejects an invalid order with the list of problems and creates nothing", async () => {
    const { handler, repo } = setup();
    const bad = validBody();
    bad.customer.name = "";
    const res = await call(handler, bad);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("validation_failed");
    expect(body.errors.join(" ")).toMatch(/name/i);
    expect(repo.calls.createOrder).toHaveLength(0);
  });

  it("never forwards client-supplied prices, totals or statuses to the database", async () => {
    const { handler, repo } = setup();
    await call(handler, { ...validBody(), total_amount: 0.01, payment_status: "confirmed", price: 1 });
    const args = repo.calls.createOrder[0];
    expect(JSON.stringify(args)).not.toMatch(/total_amount|payment_status|0\.01/);
    expect(args.source).toBe("web");
    expect(args.actor).toBeNull();
  });

  it("returns a signed Sadad request built from the DATABASE total", async () => {
    const { handler } = setup();
    const res = await call(handler, validBody(), { origin: "https://shop.example.qa" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.order).toMatchObject({ booking_reference: "QTR-AAAAAAAAAAAA", total_amount: 200, payment_method: "sadad" });
    const { url, fields } = body.payment;
    expect(url).toBe("https://sadadqa.com/webpurchase");
    expect(fields).toMatchObject({
      merchant_id: "1664851",
      ORDER_ID: "QTR-AAAAAAAAAAAA",
      TXN_AMOUNT: "200.00",
      WEBSITE: "example.qa",
      CALLBACK_URL: `${SUPABASE_URL}/functions/v1/sadad-callback`,
      MOBILE_NO: "97455512345",
      EMAIL: "ahmed@example.com",
      txnDate: "2026-10-09",
    });
    expect(fields.signature).toMatch(/^[0-9A-F]{64}$/);
    expect(JSON.stringify(body)).not.toContain("S3CR3T");
  });

  it("uses a synthetic email when the customer gave none", async () => {
    const { handler } = setup();
    const body = validBody();
    body.customer.email = "";
    const res = await (await call(handler, body)).json();
    expect(res.payment.fields.EMAIL).toBe("noreply@example.qa");
  });

  it("remembers the browser origin for the post-payment redirect, but only a safe one", async () => {
    const a = setup();
    await call(a.handler, validBody(), { origin: "https://shop.example.qa" });
    expect(a.repo.calls.createOrder[0].returnOrigin).toBe("https://shop.example.qa");
    const b = setup();
    await call(b.handler, validBody(), { origin: "javascript:alert(1)" });
    expect(b.repo.calls.createOrder[0].returnOrigin).toBeNull();
  });

  it("refuses online payment (before reserving anything) when Sadad is not configured", async () => {
    const { handler, repo } = setup({ settings: configuredSettings({ secret: null }) });
    const res = await call(handler, validBody());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("payment_unavailable");
    expect(repo.calls.createOrder).toHaveLength(0);
  });

  it("cash-at-venue orders need no gateway and notify the automation without delaying the response", async () => {
    const { handler, waited, webhookCalls, repo } = setup({ settings: configuredSettings({ secret: null }) });
    const res = await call(handler, validBody({ payment_method: "cash_pos" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payment).toBeUndefined();
    expect(repo.calls.createOrder[0].paymentMethod).toBe("cash_pos");
    await Promise.all(waited);
    expect(webhookCalls).toHaveLength(1);
    expect(webhookCalls[0].url).toBe("https://n8n.example/hook");
    expect(webhookCalls[0].body).toMatchObject({ bookingReference: "QTR-AAAAAAAAAAAA", adminPhone: "97455500000" });
  });

  it("does not notify the automation for online orders until they are paid", async () => {
    const { handler, waited, webhookCalls } = setup();
    await call(handler, validBody());
    await Promise.all(waited);
    expect(webhookCalls).toHaveLength(0);
  });

  it("creates a QR image per ticket and stores its URL separately from the code", async () => {
    const { handler, storage, repo } = setup();
    await call(handler, validBody());
    expect(storage.uploads).toEqual(["QTR-AAAAAAAAAAAA-TKT01.png", "QTR-AAAAAAAAAAAA-TKT02.png"]);
    expect(repo.calls.setQrImageUrl).toEqual([
      ["holder-1", `${SUPABASE_URL}/storage/v1/object/public/qr-codes/QTR-AAAAAAAAAAAA-TKT01.png`],
      ["holder-2", `${SUPABASE_URL}/storage/v1/object/public/qr-codes/QTR-AAAAAAAAAAAA-TKT02.png`],
    ]);
  });

  it("still succeeds when a QR image cannot be produced (the ticket works by code)", async () => {
    const { handler } = setup({}, { generateQr: async () => { throw new Error("QR generation failed"); } });
    const res = await call(handler, validBody());
    expect(res.status).toBe(200);
    expect((await res.json()).payment.fields.signature).toBeTruthy();
  });

  it("passes database rejections through with their status and code", async () => {
    const { handler } = setup({
      createOrder: async () => { throw new HttpError(409, "insufficient_stock", "Not enough tickets left", { ticket_type: "vip" }); },
    });
    const res = await call(handler, validBody());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "insufficient_stock", ticket_type: "vip" });
  });

  it("hides unexpected database failures", async () => {
    const { handler } = setup({ createOrder: async () => { throw new Error('connection to "db.internal" refused'); } });
    const res = await call(handler, validBody());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("db.internal");
  });

  it("throttles customers who already hold several unpaid orders (online or cash)", async () => {
    const { handler, repo } = setup({ openOrders: 4 });
    const res = await call(handler, validBody());
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("too_many_pending_orders");
    expect(repo.calls.createOrder).toHaveLength(0);
  });

  describe("point of sale", () => {
    const posBody = (over: Record<string, unknown> = {}) => validBody({ source: "pos", payment_method: "cash_pos", ...over });
    const GOOD = "gate-team-7Qx!2";

    it("is for staff only: visitors, the public key and plain members are refused", async () => {
      const { handler, repo } = setup();
      expect((await call(handler, posBody())).status).toBe(401);
      expect((await call(handler, posBody(), { authorization: "Bearer the-public-anon-key" })).status).toBe(401);
      expect((await call(handler, posBody(), { authorization: "Bearer member-jwt" })).status).toBe(401);
      expect(repo.calls.createOrder).toHaveLength(0);
    });

    it("the public site can never ask for it by adding a field", async () => {
      const { handler, repo } = setup();
      const res = await call(handler, validBody({ source: "pos", payment_method: "cash_pos", status: "confirmed", total_amount: 0 }));
      expect(res.status).toBe(401);
      expect(repo.calls.createOrder).toHaveLength(0);
    });

    it("lets an administrator sell, attributing the order to them", async () => {
      const { handler, repo, waited } = setup();
      const res = await call(handler, posBody(), { authorization: "Bearer admin-jwt" });
      expect(res.status).toBe(200);
      expect(repo.calls.createOrder[0]).toMatchObject({ source: "pos", actor: "admin-1", paymentMethod: "cash_pos" });
      const body = await res.json();
      expect(body.order.payment_status).toBe("confirmed");
      expect(body.payment).toBeUndefined();
      await Promise.all(waited);
    });

    it("lets a moderator account sell", async () => {
      const { handler, repo } = setup();
      expect((await call(handler, posBody(), { authorization: "Bearer mod-jwt" })).status).toBe(200);
      expect(repo.calls.createOrder[0]).toMatchObject({ source: "pos", actor: "mod-1" });
    });

    it("lets gate staff sell with the team passcode (no account, so no actor)", async () => {
      const { handler, repo } = setup({}, { staffPasscode: GOOD });
      const res = await call(handler, posBody({ staff_passcode: GOOD }));
      expect(res.status).toBe(200);
      expect(repo.calls.createOrder[0]).toMatchObject({ source: "pos", actor: null });
    });

    it("refuses a wrong passcode, a missing one, and any passcode when none is configured", async () => {
      const configured = setup({}, { staffPasscode: GOOD });
      expect((await call(configured.handler, posBody({ staff_passcode: "wrong-wrong-1" }))).status).toBe(401);
      expect((await call(configured.handler, posBody())).status).toBe(401);
      const unconfigured = setup({}, { staffPasscode: undefined });
      expect((await call(unconfigured.handler, posBody({ staff_passcode: GOOD }))).status).toBe(401);
      expect(configured.repo.calls.createOrder.length + unconfigured.repo.calls.createOrder.length).toBe(0);
    });

    it("never accepts the passcode that used to be written in the source code", async () => {
      const { handler } = setup({}, { staffPasscode: "@@@Qatar123" });
      expect((await call(handler, posBody({ staff_passcode: "@@@Qatar123" }))).status).toBe(401);
    });

    it("sells cash only", async () => {
      const { handler, repo } = setup();
      const res = await call(handler, posBody({ payment_method: "sadad" }), { authorization: "Bearer admin-jwt" });
      expect(res.status).toBe(400);
      expect(repo.calls.createOrder).toHaveLength(0);
    });

    it("records the cashier when one is named, and rejects a malformed cashier id", async () => {
      const { handler, repo } = setup();
      const cashier = "c1000000-0000-4000-8000-000000000001";
      await call(handler, posBody({ pos_user_id: cashier }), { authorization: "Bearer admin-jwt" });
      expect(repo.calls.createOrder[0].posUser).toBe(cashier);
      const bad = await call(handler, posBody({ pos_user_id: "not-a-uuid" }), { authorization: "Bearer admin-jwt" });
      expect(bad.status).toBe(400);
    });

    it("an online order never carries a cashier", async () => {
      const { handler, repo } = setup();
      await call(handler, validBody({ pos_user_id: "c1000000-0000-4000-8000-000000000001" }));
      expect(repo.calls.createOrder[0]).toMatchObject({ source: "web", posUser: null });
    });

    it("tells the administrator about the sale in the background", async () => {
      const calls: [string, unknown][] = [];
      const { handler, waited } = setup({}, { callFunction: async (name, body) => void calls.push([name, body]) });
      await call(handler, posBody(), { authorization: "Bearer admin-jwt" });
      await Promise.all(waited);
      expect(calls).toEqual([["notify-admin-sale", { order_id: "order-1" }]]);
    });

    it("a failing alert never fails the sale", async () => {
      const { handler, waited } = setup({}, { callFunction: async () => { throw new Error("mail down"); } });
      const res = await call(handler, posBody(), { authorization: "Bearer admin-jwt" });
      expect(res.status).toBe(200);
      await Promise.all(waited);
    });

    it("is not subject to the online-order throttle", async () => {
      const { handler } = setup({ openOrders: 99 });
      expect((await call(handler, posBody(), { authorization: "Bearer admin-jwt" })).status).toBe(200);
    });
  });

  describe("per-person limit", () => {
    it("tells the customer, in the database's own words, why a 6th ticket is refused", async () => {
      const message = "TICKET_LIMIT_EXCEEDED: الحد الأقصى هو 5 تذاكر (عادي + VIP) لكل شخص. Ahmed لديه 5 تذكرة بالفعل";
      const { handler } = setup({
        createOrder: async () => {
          throw mapOrderError(message) ?? new Error(message);
        },
      });
      const res = await call(handler, validBody());
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ code: "ticket_limit_exceeded", error: expect.stringContaining("الحد الأقصى هو 5 تذاكر") });
    });
  });

  it("passes an explicit holder country code through", async () => {
    const { handler, repo } = setup();
    const body = validBody();
    (body.holders[0] as Record<string, unknown>).country_code = "+966";
    await call(handler, body);
    expect((repo.calls.createOrder[0].holders[0] as Record<string, unknown>).country_code).toBe("+966");
  });

  it("only ever accepts the documented body fields for the ticket references", async () => {
    const { handler, repo } = setup();
    await call(handler, validBody());
    expect(repo.calls.createOrder[0].items).toEqual([{ ticket_id: T1, quantity: 2 }]);
  });
});

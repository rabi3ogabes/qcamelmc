import { describe, expect, it } from "vitest";
import { createRepo, type SupabaseLike } from "../../supabase/functions/_shared/repo.ts";
import { failureSource, makeProcessorDeps } from "../../supabase/functions/_shared/payment-wiring.ts";
import { processPayment } from "../../supabase/functions/_shared/payment-processor.ts";
import type { SadadApiResult } from "../../supabase/functions/_shared/sadad-api.ts";
import { sendToWebhookHandler } from "../../supabase/functions/send-to-webhook/handler.ts";
import { parseCreateOrderInput } from "../../supabase/functions/_shared/validation.ts";
import { mapOrderError } from "../../supabase/functions/_shared/order-errors.ts";
import { T1, configuredSettings, fn, makeRepo, post, validBody } from "./helpers.ts";

type Result = { data: unknown; error: { message: string } | null };

/** A minimal stand-in for the Supabase client: every query chain resolves to a configured result. */
function fakeSb(respond: (table: string, ops: [string, ...unknown[]][]) => Result, rpc?: (fn: string, args: Record<string, unknown>) => Result) {
  const log: { table: string; ops: [string, ...unknown[]][] }[] = [];
  const from = (table: string) => {
    const ops: [string, ...unknown[]][] = [];
    log.push({ table, ops });
    const resolve = () => respond(table, ops);
    const chain: Record<string, unknown> = new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === "then") return (ok: (r: Result) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad);
        if (prop === "maybeSingle" || prop === "single") return async () => resolve();
        return (...args: unknown[]) => {
          ops.push([prop, ...args]);
          return chain;
        };
      },
    });
    return chain;
  };
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const sb = {
    from,
    rpc: (name: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ fn: name, args });
      return Promise.resolve(rpc ? rpc(name, args) : { data: null, error: null });
    },
    storage: { from: () => ({}) },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  } as unknown as SupabaseLike;
  return { sb, log, rpcCalls };
}

const ok = (data: unknown): Result => ({ data, error: null });

describe("repository: how the database's rows become payment states", () => {
  const orderRow = (over: Record<string, unknown>) => ({
    id: "o1", booking_reference: "QTR-A", total_amount: 150, payment_status: "pending", payment_note: null, return_origin: null, ...over,
  });
  const repoFor = (row: unknown) => createRepo(fakeSb((table) => (table === "orders" ? ok(row) : ok(null))).sb);

  it("a cancelled order whose payment failed or expired is 'failed' (it may still turn out to have been paid)", async () => {
    for (const note of ["payment_failed", "expired", "paid_after_expiry_no_stock"]) {
      const order = await repoFor(orderRow({ payment_status: "cancelled", payment_note: note })).getPaymentOrder("QTR-A");
      expect(order?.payment_status).toBe("failed");
    }
  });

  it("a cancellation by staff stays 'cancelled', pending and confirmed are untouched", async () => {
    expect((await repoFor(orderRow({ payment_status: "cancelled", payment_note: "admin_cancelled" })).getPaymentOrder("x"))?.payment_status).toBe("cancelled");
    expect((await repoFor(orderRow({ payment_status: "cancelled", payment_note: null })).getPaymentOrder("x"))?.payment_status).toBe("cancelled");
    expect((await repoFor(orderRow({ payment_status: "pending" })).getPaymentOrder("x"))?.payment_status).toBe("pending");
    expect((await repoFor(orderRow({ payment_status: "confirmed", payment_note: "expired" })).getPaymentOrder("x"))?.payment_status).toBe("confirmed");
  });

  it("does not leak the internal note and returns null for an unknown order", async () => {
    const order = await repoFor(orderRow({ payment_status: "cancelled", payment_note: "expired" })).getPaymentOrder("QTR-A");
    expect(order).not.toHaveProperty("payment_note");
    expect(await repoFor(null).getPaymentOrder("QTR-NOPE")).toBeNull();
  });

  it("administrators are admin_users rows or holders of the admin role; moderators hold the moderator role", async () => {
    const roles: Record<string, string[]> = { "role-admin": ["admin"], "mod": ["moderator"] };
    const { sb } = fakeSb((table, ops) => {
      const eq = Object.fromEntries(ops.filter(([op]) => op === "eq").map(([, col, val]) => [col as string, val]));
      if (table === "admin_users") return ok(eq.id === "listed-admin" ? { id: "listed-admin" } : null);
      if (table === "user_roles") return ok((roles[eq.user_id as string] ?? []).includes(eq.role as string) ? { role: eq.role } : null);
      return ok(null);
    });
    const repo = createRepo(sb);
    expect(await repo.isAdmin("listed-admin")).toBe(true);
    expect(await repo.isAdmin("role-admin")).toBe(true);
    expect(await repo.isAdmin("mod")).toBe(false);
    expect(await repo.isAdmin("stranger")).toBe(false);
    expect(await repo.isModerator?.("mod")).toBe(true);
    expect(await repo.isModerator?.("role-admin")).toBe(false);
  });

  it("reads gateway settings from the settings row and honours the on/off switches", async () => {
    const row = {
      webhook_url: " https://n8n.example/a ", email_webhook_url: "https://n8n.example/mail", admin_phone: "+974 1",
      sadad_merchant_id: "123", sadad_secret: "S", sadad_api_key: "pin", sadad_website_domain: "example.qa",
      sadad_environment: "sandbox", site_url: "https://example.qa", webhook_enabled: true, email_webhook_enabled: true,
    };
    const on = await createRepo(fakeSb(() => ok(row)).sb).getPrivateSettings();
    expect(on).toMatchObject({ webhookUrl: "https://n8n.example/a", emailWebhookUrl: "https://n8n.example/mail", merchantId: "123", environment: "sandbox" });
    const off = await createRepo(fakeSb(() => ok({ ...row, webhook_enabled: false, email_webhook_enabled: false })).sb).getPrivateSettings();
    expect(off.webhookUrl).toBeNull();
    expect(off.emailWebhookUrl).toBeNull();
    const odd = await createRepo(fakeSb(() => ok({ ...row, sadad_environment: "nonsense" })).sb).getPrivateSettings();
    expect(odd.environment).toBe("auto");
    const empty = await createRepo(fakeSb(() => ok(null)).sb).getPrivateSettings();
    expect(empty).toMatchObject({ webhookUrl: null, merchantId: null, environment: "auto" });
  });

  it("passes the cashier to create_order", async () => {
    const { sb, rpcCalls } = fakeSb(() => ok(null), () => ok({ order_id: "o1" }));
    await createRepo(sb).createOrder({
      customer: {}, items: [], holders: [], paymentMethod: "cash_pos", source: "pos", actor: "a1", returnOrigin: null, posUser: "p1",
    });
    expect(rpcCalls[0]).toMatchObject({ fn: "create_order", args: { p_source: "pos", p_actor: "a1", p_pos_user: "p1" } });
  });

  it("turns the database's limit message into a customer-facing error", async () => {
    const { sb } = fakeSb(() => ok(null), () => ({ data: null, error: { message: "TICKET_LIMIT_EXCEEDED: الحد الأقصى هو 5 تذاكر. Ali لديه 5 تذكرة" } }));
    await expect(
      createRepo(sb).createOrder({ customer: {}, items: [], holders: [], paymentMethod: "sadad", source: "web", actor: null, returnOrigin: null }),
    ).rejects.toMatchObject({ status: 422, code: "ticket_limit_exceeded" });
  });

  it("records a payment error together with who and what, taken from the order", async () => {
    const inserted: unknown[] = [];
    const { sb } = fakeSb((table, ops) => {
      if (table === "payment_errors") {
        inserted.push(ops.find(([op]) => op === "insert")?.[1]);
        return ok(null);
      }
      return ok({ event_id: "e1", quantity: 2, payment_id: "SD-1", customers: { name: "Ahmed", phone: "5551" } });
    });
    await createRepo(sb).recordPaymentError({
      order_id: "o1", booking_reference: "QTR-A", amount: 150, error_source: "bank", error_code: "PAYMENT_FAILED", error_message: "declined",
    });
    expect(inserted[0]).toMatchObject({
      order_id: "o1", booking_reference: "QTR-A", event_id: "e1", quantity: 2, customer_name: "Ahmed", customer_phone: "5551",
      amount: 150, error_source: "bank", error_message: "declined",
    });
  });

  it("marks an order as 'sending' by id, or by booking reference", async () => {
    const seen: [string, unknown][][] = [];
    const { sb } = fakeSb((_table, ops) => (seen.push(ops as never), ok(null)));
    const repo = createRepo(sb);
    await repo.markAutomationPending({ orderId: "o1", bookingReference: "QTR-A", message: "sending" });
    await repo.markAutomationPending({ orderId: null, bookingReference: "QTR-A", message: "sending" });
    expect(seen[0].find(([op]) => op === "eq")).toEqual(["eq", "id", "o1"]);
    expect(seen[1].find(([op]) => op === "eq")).toEqual(["eq", "booking_reference", "QTR-A"]);
    expect(seen[0].find(([op]) => op === "update")?.[1]).toEqual({ n8n_response_message: "sending", n8n_responded_at: null });
  });
});

describe("what follows a settled payment", () => {
  const REF = "QTR-ABC123DEF456";
  const pending = { id: "order-1", booking_reference: REF, total_amount: 150, payment_status: "pending" as const };
  const context = {
    order: { ...pending, payment_status: "confirmed", payment_id: "SD-1" },
    customer: { name: "Ahmed", phone: "5551", country_code: "+974" },
    event: { title: "Festival" },
    holders: [{ name: "Sara", phone: "5559", country_code: "+974", ticket_type: "vip", qr_code: `${REF}-TKT01` }],
    prices: { vip: 150 },
  };
  const paid: SadadApiResult = { kind: "success", transactionNumber: "SD-1", amount: 150, websiteRefNo: REF, sandbox: false };
  const declined: SadadApiResult = { kind: "failed", transactionNumber: null };

  function run(api: SadadApiResult, over: { settings?: ReturnType<typeof configuredSettings>; callFunction?: (n: string, b: unknown) => Promise<unknown>; waitUntil?: (p: Promise<unknown>) => void } = {}) {
    const repo = makeRepo({ orders: { [REF]: pending }, context: context as never });
    const posted: { url: string; body: Record<string, unknown> }[] = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("n8n.example")) posted.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response("ok");
    }) as typeof fetch;
    const functions: [string, unknown][] = [];
    const deps = makeProcessorDeps({
      repo, settings: over.settings ?? configuredSettings(), fetch: fetchImpl,
      callFunction: over.callFunction ?? (async (name, body) => void functions.push([name, body])),
      waitUntil: over.waitUntil,
    });
    deps.lookupSadad = async () => api;
    return { repo, posted, functions, outcome: processPayment({ orderRef: REF, payload: null, rawPayload: {}, checksumValid: false, source: "poll" }, deps) };
  }

  it("a confirmed payment sends the invoice, alerts the admin and tells the automation — once", async () => {
    const { outcome, functions, posted } = run(paid);
    expect((await outcome).outcome).toBe("confirmed");
    expect(functions.sort()).toEqual([["notify-admin-sale", { order_id: "order-1" }], ["send-invoice-email", { order_id: "order-1" }]]);
    expect(posted).toHaveLength(1);
    expect(posted[0].body).toMatchObject({ action: "payment_confirmed", booking_reference: REF });
  });

  it("a switched-off automation is skipped, the e-mails still go out", async () => {
    const { outcome, functions, posted } = run(paid, { settings: configuredSettings({ webhookUrl: null }) });
    await outcome;
    expect(functions).toHaveLength(2);
    expect(posted).toHaveLength(0);
  });

  it("a failing e-mail or automation never changes the payment result", async () => {
    const { outcome, repo } = run(paid, { callFunction: async () => { throw new Error("mail down"); } });
    expect((await outcome).outcome).toBe("confirmed");
    expect(repo.calls.confirm).toEqual([[REF, "SD-1"]]);
  });

  it("with background execution available the response does not wait for the follow-ups", async () => {
    let release!: () => void;
    const slow = new Promise<void>((resolve) => { release = resolve; });
    const background: Promise<unknown>[] = [];
    const { outcome } = run(paid, { callFunction: () => slow, waitUntil: (p) => void background.push(p) });
    expect((await outcome).outcome).toBe("confirmed"); // returns although the mail is still "sending"
    release();
    await Promise.all(background);
  });

  it("a payment Sadad reports as failed is logged for the admin and the customer is told", async () => {
    const { outcome, functions, repo } = run(declined);
    expect((await outcome).outcome).toBe("failed");
    expect(functions).toEqual([["send-payment-failed-email", { order_id: "order-1" }]]);
    expect(repo.calls.paymentErrors).toHaveLength(1);
    expect(repo.calls.paymentErrors[0]).toMatchObject({
      order_id: "order-1", booking_reference: REF, amount: 150, error_code: "PAYMENT_FAILED", error_source: "sadad",
    });
  });

  it("nothing follows an undecided payment", async () => {
    const { outcome, functions, repo, posted } = run({ kind: "not_found" });
    expect((await outcome).outcome).toBe("pending");
    expect(functions).toHaveLength(0);
    expect(posted).toHaveLength(0);
    expect(repo.calls.paymentErrors).toHaveLength(0);
  });

  it("separates the bank saying no from the gateway failing", () => {
    expect(failureSource("Card declined by issuer")).toBe("bank");
    expect(failureSource("رصيد غير كاف")).toBe("bank");
    expect(failureSource("sadad_reported_failure")).toBe("sadad");
  });
});

describe("send-to-webhook: the e-mail action", () => {
  const setup = (settings = configuredSettings({ emailWebhookUrl: "https://n8n.example/mail" })) => {
    const repo = makeRepo({ settings });
    const urls: string[] = [];
    const handler = sendToWebhookHandler({
      repo, auth: repo,
      fetch: (async (url: RequestInfo | URL) => (urls.push(String(url)), new Response("queued"))) as typeof fetch,
    });
    return { repo, urls, handler };
  };
  const ADMIN = { authorization: "Bearer admin-jwt" };

  it("sends e-mails to the e-mail automation and tickets to the WhatsApp one", async () => {
    const { handler, urls } = setup();
    await handler(post(fn("send-to-webhook"), { action: "send_email", order_id: "o1" }, ADMIN));
    await handler(post(fn("send-to-webhook"), { action: "send_ticket", order_id: "o1" }, ADMIN));
    expect(urls).toEqual(["https://n8n.example/mail", "https://n8n.example/hook"]);
  });

  it("falls back to the main automation when there is no separate e-mail one", async () => {
    const { handler, urls } = setup(configuredSettings({ emailWebhookUrl: null }));
    await handler(post(fn("send-to-webhook"), { action: "send_email" }, ADMIN));
    expect(urls).toEqual(["https://n8n.example/hook"]);
  });

  it("says which automation is missing", async () => {
    const { handler } = setup(configuredSettings({ webhookUrl: null, emailWebhookUrl: null }));
    const res = await handler(post(fn("send-to-webhook"), { action: "send_email" }, ADMIN));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "webhook_not_configured", error: expect.stringMatching(/email/i) });
  });

  it("shows 'sending…' on the order until the automation answers", async () => {
    const { handler, repo } = setup();
    await handler(post(fn("send-to-webhook"), { action: "send_email", order_id: "o1", booking_reference: "QTR-A" }, ADMIN));
    await handler(post(fn("send-to-webhook"), { action: "send_ticket", booking_reference: "QTR-B" }, ADMIN));
    await handler(post(fn("send-to-webhook"), { action: "send_ticket" }, ADMIN));
    expect(repo.calls.pending).toEqual([
      { orderId: "o1", bookingReference: "QTR-A", message: "جاري إرسال البريد الإلكتروني..." },
      { orderId: null, bookingReference: "QTR-B", message: "جاري الإرسال إلى واتساب..." },
    ]);
  });

  it("does not mark the order when the automation refused", async () => {
    const repo = makeRepo();
    const handler = sendToWebhookHandler({ repo, auth: repo, fetch: (async () => new Response("no", { status: 500 })) as typeof fetch });
    await handler(post(fn("send-to-webhook"), { action: "send_ticket", order_id: "o1" }, ADMIN));
    expect(repo.calls.pending).toEqual([]);
  });
});

describe("order input: new fields", () => {
  it("accepts a holder country code and rejects a malformed one", () => {
    const body = validBody();
    (body.holders[0] as Record<string, unknown>).country_code = "+966";
    const parsed = parseCreateOrderInput(body);
    expect(parsed.ok && parsed.value.holders[0].country_code).toBe("+966");
    expect(parsed.ok && parsed.value.holders[1].country_code).toBe("");
    (body.holders[0] as Record<string, unknown>).country_code = "966";
    expect(parseCreateOrderInput(body).ok).toBe(false);
  });

  it("source defaults to the public site; only 'web' and 'pos' exist", () => {
    const web = parseCreateOrderInput(validBody());
    expect(web.ok && web.value.source).toBe("web");
    const pos = parseCreateOrderInput(validBody({ source: "pos", payment_method: "cash_pos" }));
    expect(pos.ok && pos.value.source).toBe("pos");
    expect(parseCreateOrderInput(validBody({ source: "admin" })).ok).toBe(false);
  });

  it("maps the database's refusal reasons", () => {
    expect(mapOrderError("insufficient_stock:vip")).toMatchObject({ status: 409, extra: { ticket_type: "vip" } });
    expect(mapOrderError("TICKET_LIMIT_EXCEEDED: msg here")).toMatchObject({ status: 422, code: "ticket_limit_exceeded", message: "msg here" });
    expect(mapOrderError("something else")).toBeNull();
    expect(T1).toBeTruthy();
  });
});

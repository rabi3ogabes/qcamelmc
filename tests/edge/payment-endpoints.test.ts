import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sadadCallbackHandler } from "../../supabase/functions/sadad-callback/handler.ts";
import { sadadWebhookHandler } from "../../supabase/functions/sadad-webhook/handler.ts";
import { verifyPaymentHandler } from "../../supabase/functions/verify-payment/handler.ts";
import { sadadPaymentHandler } from "../../supabase/functions/sadad-payment/handler.ts";
import type { PaymentOrder } from "../../supabase/functions/_shared/payment-processor.ts";
import type { OrderContext } from "../../supabase/functions/_shared/repo.ts";
import { SUPABASE_URL, configuredSettings, formPost, fn, makeRepo, post } from "./helpers.ts";

const REF = "QTR-AAAAAAAAAAAA";
const SECRET = "S3CR3T";

const pendingOrder = (over: Partial<PaymentOrder> = {}): PaymentOrder => ({
  id: "order-1",
  booking_reference: REF,
  total_amount: 150,
  payment_status: "pending",
  return_origin: "https://shop.example.qa",
  ...over,
});

const signed = (fields: Record<string, string>, secret = SECRET) => ({
  ...fields,
  checksumhash: createHash("sha256")
    .update(secret + Object.keys(fields).sort().map((k) => fields[k]).join(""))
    .digest("hex"),
});

const callbackFields = (over: Record<string, string> = {}) => ({
  MID: "1664851",
  ORDERID: REF,
  RESPCODE: "3",
  RESPMSG: "Txn Success",
  TXNAMOUNT: "150.00",
  STATUS: "TXN_SUCCESS",
  transaction_number: "SD-REAL-1",
  transaction_status: "3",
  website_ref_no: REF,
  issandboxmode: "0",
  ...over,
});

type SadadRow = Record<string, unknown>;

/** Fake of Sadad's API + the n8n automation endpoint. */
function network(opts: { rows?: SadadRow[]; loginOk?: boolean; apiDown?: boolean } = {}) {
  const n8n: unknown[] = [];
  const apiCalls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://n8n.example")) {
      n8n.push(JSON.parse(String(init?.body)));
      return new Response("ok");
    }
    apiCalls.push(url);
    if (opts.apiDown) throw new TypeError("network down");
    if (url.endsWith("/api/userbusinesses/login")) {
      return url.startsWith("https://api-s.sadad.qa") && opts.loginOk !== false
        ? new Response(JSON.stringify({ accessToken: "tok" }), { status: 200 })
        : new Response("{}", { status: 401 });
    }
    if (url.includes("listTransactions")) return new Response(JSON.stringify(opts.rows ?? []), { status: 200 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, n8n, apiCalls };
}

const paidRow = (over: SadadRow = {}): SadadRow => ({
  invoicenumber: "SD-REAL-1",
  amount: 150,
  website_ref_no: REF,
  transactionstatusId: 3,
  ...over,
});

const context = (): OrderContext => ({
  order: { ...pendingOrder(), payment_id: "SD-REAL-1", payment_method: "sadad" } as OrderContext["order"],
  customer: { name: "Ahmed", email: "a@b.qa", phone: "5551 2345", country_code: "+974" },
  event: { title: "Festival", event_date: "2026-12-18", location: "Doha" },
  holders: [{ name: "Ahmed", phone: "+974 5551 2345", country_code: "+974", nationality: "قطر", ticket_type: "vip", qr_code: `${REF}-TKT01`, qr_image_url: "https://x/q.png", id_number: "1" }],
  prices: { vip: 150 },
});

/** A repo whose orders change state when confirmed/failed, like the database. */
function statefulRepo(orderOver: Partial<PaymentOrder> = {}, settingsOver = {}) {
  const orders: Record<string, PaymentOrder> = { [REF]: pendingOrder(orderOver) };
  const repo = makeRepo({ orders, settings: configuredSettings(settingsOver), context: context() });
  // the context reflects the order's CURRENT status, like the real database would
  repo.getOrderContext = async () => {
    const ctx = context();
    return { ...ctx, order: { ...ctx.order, payment_status: orders[REF].payment_status } as typeof ctx.order };
  };
  repo.confirmOrderPayment = async (ref, txn) => {
    repo.calls.confirm.push([ref, txn]);
    if (orders[ref].payment_status === "confirmed") return { result: "already_confirmed" };
    orders[ref].payment_status = "confirmed";
    return { result: "confirmed" };
  };
  repo.failOrderPayment = async (ref, note) => {
    repo.calls.fail.push([ref, note]);
    if (orders[ref].payment_status !== "pending") return { result: "not_pending" };
    orders[ref].payment_status = "failed";
    return { result: "failed" };
  };
  return { repo, orders };
}

function deps(repo: ReturnType<typeof makeRepo>, net: ReturnType<typeof network>) {
  const waited: Promise<unknown>[] = [];
  return {
    d: { repo, fetch: net.fetchImpl, supabaseUrl: SUPABASE_URL, waitUntil: (p: Promise<unknown>) => void waited.push(p), now: () => new Date("2026-10-09T10:00:00Z") },
    waited,
  };
}

describe("sadad-callback", () => {
  it("confirms a paid order verified by Sadad, then sends the customer to the result page", async () => {
    const { repo, orders } = statefulRepo();
    const net = network({ rows: [paidRow()] });
    const { d, waited } = deps(repo, net);
    const res = await sadadCallbackHandler(d)(formPost(fn("sadad-callback"), signed(callbackFields())));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://shop.example.qa/payment/result?ref=${REF}`);
    expect(orders[REF].payment_status).toBe("confirmed");
    expect(repo.calls.confirm).toEqual([[REF, "SD-REAL-1"]]);
    await Promise.all(waited);
    expect(net.n8n).toHaveLength(1);
    expect(net.n8n[0]).toMatchObject({ action: "payment_confirmed", payment_status: "confirmed", events: { title: "Festival" }, booking_reference: REF });
  });

  it("does NOT confirm a forged 'success' callback that Sadad has no record of", async () => {
    const { repo, orders } = statefulRepo();
    const net = network({ rows: [] });
    const { d } = deps(repo, net);
    const forged = { ...callbackFields(), checksumhash: "0".repeat(64) };
    const res = await sadadCallbackHandler(d)(formPost(fn("sadad-callback"), forged));
    expect(res.status).toBe(303);
    expect(orders[REF].payment_status).toBe("pending");
    expect(repo.calls.confirm).toEqual([]);
    expect(repo.calls.events[0]).toMatchObject({ checksum_valid: false, decision: "pending" });
  });

  it("cannot be used to confirm an order for a different amount than was charged", async () => {
    const { repo, orders } = statefulRepo();
    const net = network({ rows: [paidRow({ amount: 3 })] });
    const { d } = deps(repo, net);
    await sadadCallbackHandler(d)(formPost(fn("sadad-callback"), signed(callbackFields())));
    expect(orders[REF].payment_status).toBe("pending");
  });

  it("marks the order failed when Sadad reports a failed payment", async () => {
    const { repo, orders } = statefulRepo();
    const net = network({ rows: [paidRow({ transactionstatusId: 2 })] });
    const { d } = deps(repo, net);
    await sadadCallbackHandler(d)(formPost(fn("sadad-callback"), signed(callbackFields({ transaction_status: "2", STATUS: "TXN_FAILURE" }))));
    expect(orders[REF].payment_status).toBe("failed");
  });

  it("leaves the order pending for staff review when Sadad's API is unreachable, even for a signed callback", async () => {
    const { repo, orders } = statefulRepo();
    const net = network({ apiDown: true });
    const { d } = deps(repo, net);
    const res = await sadadCallbackHandler(d)(formPost(fn("sadad-callback"), signed(callbackFields())));
    expect(res.status).toBe(303);
    expect(orders[REF].payment_status).toBe("pending");
    expect(repo.calls.events[0]).toMatchObject({ checksum_valid: true, api_result: "unavailable", decision: "review" });
  });

  it("prefers the configured site url for the redirect", async () => {
    const { repo } = statefulRepo({}, { siteUrl: "https://www.qcamelmc.qa/" });
    const { d } = deps(repo, network({ rows: [paidRow()] }));
    const res = await sadadCallbackHandler(d)(formPost(fn("sadad-callback"), signed(callbackFields())));
    expect(res.headers.get("location")).toBe(`https://www.qcamelmc.qa/payment/result?ref=${REF}`);
  });

  it("shows a plain confirmation page when no safe return address is known", async () => {
    const { repo } = statefulRepo({ return_origin: null });
    const { d } = deps(repo, network({ rows: [paidRow()] }));
    const res = await sadadCallbackHandler(d)(formPost(fn("sadad-callback"), signed(callbackFields())));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain(REF);
  });

  it("copes with garbage and never throws or leaks", async () => {
    const { repo } = statefulRepo();
    const { d } = deps(repo, network());
    const res = await sadadCallbackHandler(d)(formPost(fn("sadad-callback"), { foo: "bar" }));
    expect([200, 303]).toContain(res.status);
    expect(repo.calls.confirm).toEqual([]);
  });

  it("also accepts the result as a GET redirect", async () => {
    const { repo, orders } = statefulRepo();
    const { d } = deps(repo, network({ rows: [paidRow()] }));
    const qs = new URLSearchParams(signed(callbackFields())).toString();
    const res = await sadadCallbackHandler(d)(new Request(`${fn("sadad-callback")}?${qs}`, { method: "GET" }));
    expect(res.status).toBe(303);
    expect(orders[REF].payment_status).toBe("confirmed");
  });
});

describe("sadad-webhook", () => {
  const webhookBody = (over: Record<string, unknown> = {}) => ({
    isTestMode: 0, merchantId: 1664851, message: "success",
    transactionNumber: "SD-REAL-1", transactionStatus: 3, txnAmount: 150, websiteRefNo: REF, ...over,
  });
  const signedWebhook = (body: Record<string, unknown>) => ({
    ...body,
    checksumhash: createHash("sha256")
      .update(SECRET + Object.keys(body).sort().map((k) => (body[k] === null || body[k] === undefined ? "" : String(body[k]))).join(""))
      .digest("hex"),
  });

  it("confirms from a verified webhook and always answers 200 {status:'success'}", async () => {
    const { repo, orders } = statefulRepo();
    const { d } = deps(repo, network({ rows: [paidRow()] }));
    const res = await sadadWebhookHandler(d)(post(fn("sadad-webhook"), signedWebhook(webhookBody())));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "success" });
    expect(orders[REF].payment_status).toBe("confirmed");
    expect(repo.calls.events[0]).toMatchObject({ source: "webhook", checksum_valid: true });
  });

  it("is idempotent: a replayed webhook changes nothing and notifies once", async () => {
    const { repo } = statefulRepo();
    const net = network({ rows: [paidRow()] });
    const { d, waited } = deps(repo, net);
    const handler = sadadWebhookHandler(d);
    await handler(post(fn("sadad-webhook"), signedWebhook(webhookBody())));
    await handler(post(fn("sadad-webhook"), signedWebhook(webhookBody())));
    await Promise.all(waited);
    expect(repo.calls.confirm).toHaveLength(1);
    expect(net.n8n).toHaveLength(1);
  });

  it("ignores a forged webhook but still answers 200", async () => {
    const { repo, orders } = statefulRepo();
    const { d } = deps(repo, network({ rows: [] }));
    const res = await sadadWebhookHandler(d)(post(fn("sadad-webhook"), { ...webhookBody(), checksumhash: "bad" }));
    expect(res.status).toBe(200);
    expect(orders[REF].payment_status).toBe("pending");
  });

  it("answers 200 for malformed bodies and internal failures (so Sadad does not retry forever)", async () => {
    const { repo } = statefulRepo();
    const { d } = deps(repo, network());
    expect((await sadadWebhookHandler(d)(post(fn("sadad-webhook"), "not json"))).status).toBe(200);
    repo.getPaymentOrder = async () => { throw new Error("db down"); };
    expect((await sadadWebhookHandler(d)(post(fn("sadad-webhook"), signedWebhook(webhookBody())))).status).toBe(200);
  });
});

describe("verify-payment", () => {
  const call = (handler: (r: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) =>
    handler(post(fn("verify-payment"), body, headers));

  it("lets a customer's page trigger a check with Sadad and reports the new status", async () => {
    const { repo, orders } = statefulRepo();
    const { d } = deps(repo, network({ rows: [paidRow()] }));
    const res = await call(verifyPaymentHandler(d), { booking_reference: REF });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, checked: true, payment_status: "confirmed" });
    expect(orders[REF].payment_status).toBe("confirmed");
    expect(repo.calls.events[0].source).toBe("poll");
  });

  it("does not hammer Sadad: a throttled request just reports the current status", async () => {
    const { repo } = statefulRepo();
    repo.claimPaymentCheck = async () => null;
    const net = network({ rows: [paidRow()] });
    const { d } = deps(repo, net);
    const res = await call(verifyPaymentHandler(d), { booking_reference: REF });
    expect(await res.json()).toMatchObject({ success: true, checked: false, payment_status: "pending" });
    expect(net.apiCalls).toEqual([]);
  });

  it("lets an administrator force a check regardless of the throttle", async () => {
    const { repo, orders } = statefulRepo();
    repo.claimPaymentCheck = async () => null;
    const { d } = deps(repo, network({ rows: [paidRow()] }));
    const res = await call(verifyPaymentHandler(d), { booking_reference: REF }, { authorization: "Bearer admin-jwt" });
    expect(await res.json()).toMatchObject({ checked: true, payment_status: "confirmed" });
    expect(orders[REF].payment_status).toBe("confirmed");
    expect(repo.calls.events[0].source).toBe("admin");
  });

  it("rejects malformed references and unknown orders", async () => {
    const { repo } = statefulRepo();
    const { d } = deps(repo, network());
    expect((await call(verifyPaymentHandler(d), { booking_reference: "x&y" })).status).toBe(400);
    expect((await call(verifyPaymentHandler(d), { booking_reference: "QTR-NOPE00000000" })).status).toBe(404);
  });
});

describe("sadad-payment (restart payment for a pending order)", () => {
  const call = (handler: (r: Request) => Promise<Response>, body: unknown) => handler(post(fn("sadad-payment"), body));

  it("returns a freshly signed request built from the stored order", async () => {
    const { repo } = statefulRepo();
    const ctx = context();
    ctx.order = { ...ctx.order, payment_method: "sadad", total_amount: 150 } as OrderContext["order"];
    repo.getOrderContext = async () => ctx;
    const { d } = deps(repo, network());
    const res = await call(sadadPaymentHandler(d), { booking_reference: REF });
    expect(res.status).toBe(200);
    const { payment } = await res.json();
    expect(payment.url).toBe("https://sadadqa.com/webpurchase");
    expect(payment.fields).toMatchObject({ ORDER_ID: REF, TXN_AMOUNT: "150.00", WEBSITE: "example.qa", MOBILE_NO: "97455512345" });
    expect(payment.fields.signature).toMatch(/^[0-9A-F]{64}$/);
  });

  it.each([
    ["an order that is already paid", { payment_status: "confirmed", payment_method: "sadad" }, 409],
    ["a failed/expired order", { payment_status: "failed", payment_method: "sadad" }, 409],
    ["a cash order", { payment_status: "pending", payment_method: "cash_pos" }, 409],
  ])("refuses %s", async (_label, over, status) => {
    const { repo } = statefulRepo();
    const ctx = context();
    ctx.order = { ...ctx.order, ...over } as OrderContext["order"];
    repo.getOrderContext = async () => ctx;
    const { d } = deps(repo, network());
    const res = await call(sadadPaymentHandler(d), { booking_reference: REF });
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe("not_payable");
  });

  it("404s for unknown orders and 503s when Sadad is not configured", async () => {
    const { repo } = statefulRepo();
    const { d } = deps(repo, network());
    repo.getOrderContext = async () => null;
    expect((await call(sadadPaymentHandler(d), { booking_reference: REF })).status).toBe(404);

    const unconfigured = statefulRepo({}, { secret: null });
    unconfigured.repo.getOrderContext = async () => context();
    const { d: d2 } = deps(unconfigured.repo, network());
    expect((await call(sadadPaymentHandler(d2), { booking_reference: REF })).status).toBe(503);
  });
});

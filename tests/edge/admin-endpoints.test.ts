import { describe, expect, it } from "vitest";
import { ticketCheckinHandler } from "../../supabase/functions/ticket-checkin/handler.ts";
import { sendToWebhookHandler } from "../../supabase/functions/send-to-webhook/handler.ts";
import { generateQrCodeHandler } from "../../supabase/functions/generate-qr-code/handler.ts";
import { backfillQrCodesHandler } from "../../supabase/functions/backfill-qr-codes/handler.ts";
import { regenerateBookingQrHandler } from "../../supabase/functions/regenerate-booking-qr-codes/handler.ts";
import { sadadDiagnoseHandler } from "../../supabase/functions/sadad-diagnose/handler.ts";
import { SUPABASE_URL, configuredSettings, fakeStorage, fn, makeRepo, post } from "./helpers.ts";

const ADMIN = { authorization: "Bearer admin-jwt" };
const MEMBER = { authorization: "Bearer member-jwt" };

describe("every admin function refuses visitors and non-admins", () => {
  const repo = makeRepo();
  const storage = fakeStorage();
  const gen = async () => new Uint8Array([1]);
  const handlers: [string, (r: Request) => Promise<Response>][] = [
    ["ticket-checkin", ticketCheckinHandler({ repo, auth: repo })],
    ["send-to-webhook", sendToWebhookHandler({ repo, auth: repo, fetch })],
    ["generate-qr-code", generateQrCodeHandler({ repo, auth: repo, storage, generateQr: gen })],
    ["backfill-qr-codes", backfillQrCodesHandler({ repo, auth: repo, storage, generateQr: gen })],
    ["regenerate-booking-qr-codes", regenerateBookingQrHandler({ repo, auth: repo, storage, generateQr: gen })],
    ["sadad-diagnose", sadadDiagnoseHandler({ repo, auth: repo, fetch, supabaseUrl: SUPABASE_URL })],
  ];

  it.each(handlers)("%s: 401 without a session (the public anon key is not a session)", async (name, handler) => {
    expect((await handler(post(fn(name), {}))).status).toBe(401);
    expect((await handler(post(fn(name), {}, { authorization: "Bearer the-public-anon-key" }))).status).toBe(401);
  });

  it.each(handlers)("%s: 403 for a signed-in non-admin", async (name, handler) => {
    expect((await handler(post(fn(name), {}, MEMBER))).status).toBe(403);
  });

  it.each(handlers)("%s: answers CORS preflight", async (name, handler) => {
    expect((await handler(new Request(fn(name), { method: "OPTIONS" }))).status).toBe(204);
  });
});

describe("ticket-checkin", () => {
  const run = (checkIn: (code: string, admin: string | null) => Promise<unknown>, body: unknown) => {
    const repo = makeRepo({ checkInTicket: checkIn as never });
    return ticketCheckinHandler({ repo, auth: repo })(post(fn("ticket-checkin"), body, ADMIN));
  };
  const ticket = {
    booking_reference: "QTR-A", customer_name: "Ahmed", event_title: "Festival", ticket_type: "vip",
    qr_code: "QTR-A-TKT01", holder_name: "Sara", holder_phone: "+974 1", holder_nationality: "قطر",
    holder_id_number: "99", payment_status: "confirmed", is_present: true, confirmed_at: "2026-10-09T10:00:00Z",
  };

  it("admits a paid ticket and reports who it is", async () => {
    const res = await run(async () => ({ result: "checked_in", ticket }), { booking_reference: "QTR-A-TKT01" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      ticket_info: { ticket_holder_name: "Sara", ticket_holder_id_number: "99", event_title: "Festival", quantity: 1, is_present: true },
    });
  });

  it("uses the verified admin id, never one supplied in the body", async () => {
    let seen: [string, string | null] | null = null;
    await run(async (code, admin) => { seen = [code, admin]; return { result: "not_found" }; },
      { booking_reference: "QTR-A-TKT01", admin_id: "someone-else" });
    expect(seen).toEqual(["QTR-A-TKT01", "admin-1"]);
  });

  it("explains a ticket that was already used", async () => {
    const res = await run(async () => ({ result: "already_present", ticket }), { booking_reference: "QTR-A-TKT01" });
    expect(await res.json()).toMatchObject({ success: false, error: "Already checked in", ticket_info: { is_present: true } });
  });

  it("refuses an unpaid ticket but still shows who it belongs to", async () => {
    const res = await run(async () => ({ result: "payment_not_confirmed", ticket: { ...ticket, payment_status: "pending", is_present: false } }), { booking_reference: "QTR-A-TKT01" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: false, error: "Payment not confirmed", ticket_info: { payment_status: "pending" } });
  });

  it("404s an unknown ticket and 400s a missing code", async () => {
    expect((await run(async () => ({ result: "not_found" }), { booking_reference: "NOPE-TKT01" })).status).toBe(404);
    expect((await run(async () => ({ result: "not_found" }), {})).status).toBe(400);
  });
});

describe("send-to-webhook", () => {
  const setup = (fetchImpl: typeof fetch, settings = configuredSettings()) => {
    const repo = makeRepo({ settings });
    return sendToWebhookHandler({ repo, auth: repo, fetch: fetchImpl });
  };

  it("forwards the payload to the configured automation", async () => {
    let seen: { url: string; body: unknown } | null = null;
    const handler = setup((async (url: RequestInfo | URL, init?: RequestInit) => {
      seen = { url: String(url), body: JSON.parse(String(init?.body)) };
      return new Response("queued", { status: 200 });
    }) as typeof fetch);
    const res = await handler(post(fn("send-to-webhook"), { booking_reference: "QTR-A", action: "send_ticket" }, ADMIN));
    expect(await res.json()).toMatchObject({ success: true, response: "queued" });
    expect(seen).toEqual({ url: "https://n8n.example/hook", body: { booking_reference: "QTR-A", action: "send_ticket" } });
  });

  it("says so when no automation is configured", async () => {
    const handler = setup((async () => new Response("")) as typeof fetch, configuredSettings({ webhookUrl: null }));
    const res = await handler(post(fn("send-to-webhook"), { a: 1 }, ADMIN));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Webhook URL not configured" });
  });

  it("reports an upstream error without failing the request", async () => {
    const handler = setup((async () => new Response('{"message":"not active"}', { status: 404 })) as typeof fetch);
    const res = await handler(post(fn("send-to-webhook"), { a: 1 }, ADMIN));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ error: "Webhook not found or inactive", status: 404 });
  });

  it("reports a network failure the same way", async () => {
    const handler = setup((async () => { throw new TypeError("down"); }) as typeof fetch);
    const res = await handler(post(fn("send-to-webhook"), { a: 1 }, ADMIN));
    expect(res.status).toBe(200);
    expect((await res.json()).error).toMatch(/webhook/i);
  });

  describe("notify: payment_confirmed (message built by the server from the database)", () => {
    const ctx = () => ({
      order: { id: "o1", booking_reference: "QTR-A", total_amount: 150, payment_status: "confirmed", payment_id: "SD-1" },
      customer: { name: "Ahmed", phone: "5551 2345", country_code: "+974" },
      event: { title: "Festival" },
      holders: [{ name: "Sara", phone: "+974 5551 9999", country_code: "+974", ticket_type: "vip", qr_code: "QTR-A-TKT01", qr_image_url: "https://x/q.png" }],
      prices: { vip: 150 },
    });

    it("builds the payload from the order, not from anything the browser sent", async () => {
      let sent: ({ ticket_holders: Record<string, unknown>[] } & Record<string, unknown>) | null = null;
      const repo = makeRepo({ context: ctx() as never });
      const handler = sendToWebhookHandler({
        repo, auth: repo,
        fetch: (async (_url: RequestInfo | URL, init?: RequestInit) => { sent = JSON.parse(String(init?.body)); return new Response("ok"); }) as typeof fetch,
      });
      const res = await handler(post(fn("send-to-webhook"), { notify: "payment_confirmed", booking_reference: "QTR-A", ticket_holders: [{ name: "FORGED" }] }, ADMIN));
      expect(await res.json()).toMatchObject({ success: true });
      expect(sent).toMatchObject({ action: "payment_confirmed", booking_reference: "QTR-A", customers: { name: "Ahmed" } });
      expect(JSON.stringify(sent)).not.toContain("FORGED");
      expect(sent!.ticket_holders[0]).toMatchObject({ qr_code: "https://x/q.png", ticket_price: 150 });
    });

    it("404s an unknown booking and 400s a bad reference", async () => {
      const repo = makeRepo({ context: null });
      const handler = sendToWebhookHandler({ repo, auth: repo, fetch: (async () => new Response("ok")) as typeof fetch });
      expect((await handler(post(fn("send-to-webhook"), { notify: "payment_confirmed", booking_reference: "QTR-NOPE" }, ADMIN))).status).toBe(404);
      expect((await handler(post(fn("send-to-webhook"), { notify: "payment_confirmed", booking_reference: "a b!" }, ADMIN))).status).toBe(400);
    });
  });
  it("only forwards JSON objects", async () => {
    const handler = setup((async () => new Response("")) as typeof fetch);
    expect((await handler(post(fn("send-to-webhook"), "[1,2]", ADMIN))).status).toBe(400);
  });
});

describe("QR tools", () => {
  const png = async (text: string) => new TextEncoder().encode(text);

  it("generate-qr-code renders and stores one image, returning its URL", async () => {
    const repo = makeRepo();
    const storage = fakeStorage();
    const res = await generateQrCodeHandler({ repo, auth: repo, storage, generateQr: png })(
      post(fn("generate-qr-code"), { text: "QTR-A-TKT01", filename: "QTR-A-TKT01" }, ADMIN));
    expect(await res.json()).toEqual({ url: `${SUPABASE_URL}/storage/v1/object/public/qr-codes/QTR-A-TKT01.png` });
    expect(storage.uploads).toEqual(["QTR-A-TKT01.png"]);
  });

  it("generate-qr-code refuses unsafe file names (no path tricks, no overwriting other files)", async () => {
    const repo = makeRepo();
    const storage = fakeStorage();
    const h = generateQrCodeHandler({ repo, auth: repo, storage, generateQr: png });
    for (const filename of ["../x", "a/b", "", "x.png", " "]) {
      expect((await h(post(fn("generate-qr-code"), { text: "T", filename }, ADMIN))).status).toBe(400);
    }
    expect((await h(post(fn("generate-qr-code"), { text: "", filename: "ok" }, ADMIN))).status).toBe(400);
    expect(storage.uploads).toEqual([]);
  });

  it("backfill-qr-codes creates pictures for tickets that have none, leaving the code untouched", async () => {
    const repo = makeRepo({ listHoldersMissingQrImage: async () => [{ id: "h1", qr_code: "QTR-A-TKT01" }, { id: "h2", qr_code: "QTR-A-TKT02" }] });
    const storage = fakeStorage();
    const res = await backfillQrCodesHandler({ repo, auth: repo, storage, generateQr: png })(post(fn("backfill-qr-codes"), {}, ADMIN));
    expect(await res.json()).toMatchObject({ success: true, updated: 2, skipped: 0 });
    expect(repo.calls.setQrImageUrl.map(([id]) => id)).toEqual(["h1", "h2"]);
  });

  it("backfill-qr-codes reports per-ticket failures without stopping", async () => {
    const repo = makeRepo({ listHoldersMissingQrImage: async () => [{ id: "h1", qr_code: "QTR-A-TKT01" }, { id: "h2", qr_code: "QTR-A-TKT02" }] });
    let n = 0;
    const res = await backfillQrCodesHandler({ repo, auth: repo, storage: fakeStorage(), generateQr: async (t) => { if (++n === 1) throw new Error("boom"); return png(t); } })(
      post(fn("backfill-qr-codes"), {}, ADMIN));
    const body = await res.json();
    expect(body).toMatchObject({ success: true, updated: 1 });
    expect(body.errors).toHaveLength(1);
  });

  it("regenerate-booking-qr-codes re-renders every ticket of one booking", async () => {
    const repo = makeRepo({ listBookingHolders: async () => [{ id: "h1", qr_code: "QTR-A-TKT01" }, { id: "h2", qr_code: "QTR-A-TKT02" }] });
    const storage = fakeStorage();
    const res = await regenerateBookingQrHandler({ repo, auth: repo, storage, generateQr: png })(
      post(fn("regenerate-booking-qr-codes"), { booking_reference: "QTR-A" }, ADMIN));
    expect(await res.json()).toMatchObject({ success: true, updated: 2, total: 2 });
    expect(storage.uploads).toEqual(["QTR-A-TKT01.png", "QTR-A-TKT02.png"]);
  });

  it("regenerate-booking-qr-codes 404s an unknown booking and 400s a bad reference", async () => {
    const repo = makeRepo();
    const h = regenerateBookingQrHandler({ repo, auth: repo, storage: fakeStorage(), generateQr: png });
    expect((await h(post(fn("regenerate-booking-qr-codes"), { booking_reference: "QTR-NOPE" }, ADMIN))).status).toBe(404);
    expect((await h(post(fn("regenerate-booking-qr-codes"), { booking_reference: "a b" }, ADMIN))).status).toBe(400);
  });
});

describe("sadad-diagnose", () => {
  const sadadFetch = (liveOk: boolean) => (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/login")) return liveOk && url.startsWith("https://api-s.") ? new Response(JSON.stringify({ accessToken: "t" })) : new Response("{}", { status: 401 });
    return new Response("[]", { status: 200 });
  }) as typeof fetch;

  const run = async (settings = configuredSettings(), liveOk = true) => {
    const repo = makeRepo({ settings });
    const res = await sadadDiagnoseHandler({ repo, auth: repo, fetch: sadadFetch(liveOk), supabaseUrl: SUPABASE_URL })(post(fn("sadad-diagnose"), {}, ADMIN));
    return res.json();
  };
  const status = (body: { checks: { id: string; status: string }[] }, id: string) => body.checks.find((c) => c.id === id)?.status;

  it("reports a healthy setup and the URLs to register with Sadad", async () => {
    const body = await run();
    expect(body.ready).toBe(true);
    expect(status(body, "merchant_id")).toBe("ok");
    expect(status(body, "secret")).toBe("ok");
    expect(status(body, "api_login")).toBe("ok");
    expect(body.environment).toBe("live");
    expect(body.callbackUrl).toBe(`${SUPABASE_URL}/functions/v1/sadad-callback`);
    expect(body.webhookUrl).toBe(`${SUPABASE_URL}/functions/v1/sadad-webhook`);
  });

  it("points at missing configuration", async () => {
    const body = await run(configuredSettings({ merchantId: null, secret: null }));
    expect(body.ready).toBe(false);
    expect(status(body, "merchant_id")).toBe("error");
    expect(status(body, "secret")).toBe("error");
  });

  it("says when the API credentials are rejected", async () => {
    const body = await run(configuredSettings(), false);
    expect(body.ready).toBe(false);
    expect(status(body, "api_login")).toBe("error");
  });

  it("warns when the website looks like a URL instead of the registered domain", async () => {
    const body = await run(configuredSettings({ websiteDomain: "https://example.qa/shop" }));
    expect(status(body, "website")).toBe("warn");
  });

  it("never reveals the secret", async () => {
    expect(JSON.stringify(await run())).not.toContain("S3CR3T");
  });
});

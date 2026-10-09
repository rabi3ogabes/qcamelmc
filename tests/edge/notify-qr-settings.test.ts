import { describe, expect, it } from "vitest";
import {
  buildOrderCreatedPayload,
  buildOrderPaidPayload,
  postWebhook,
} from "../../supabase/functions/_shared/notify.ts";
import { makeQrGenerator, qrObjectName } from "../../supabase/functions/_shared/qr.ts";
import {
  callbackUrlFor,
  fallbackEmail,
  isSadadConfigured,
  resolveReturnBase,
  type PrivateSettings,
} from "../../supabase/functions/_shared/settings.ts";

const settings = (over: Partial<PrivateSettings> = {}): PrivateSettings => ({
  webhookUrl: "https://n8n.example/hook",
  adminPhone: "+974 5550 0000",
  merchantId: "1664851",
  secret: "S3CR3T",
  apiKey: null,
  websiteDomain: "example.qa",
  environment: "auto",
  siteUrl: null,
  ...over,
});

describe("settings helpers", () => {
  it("knows when Sadad is fully configured", () => {
    expect(isSadadConfigured(settings())).toBe(true);
    expect(isSadadConfigured(settings({ secret: null }))).toBe(false);
    expect(isSadadConfigured(settings({ merchantId: "" }))).toBe(false);
    expect(isSadadConfigured(settings({ websiteDomain: null }))).toBe(false);
  });

  it("builds the callback url from the project url", () => {
    expect(callbackUrlFor("https://abc.supabase.co")).toBe("https://abc.supabase.co/functions/v1/sadad-callback");
    expect(callbackUrlFor("https://abc.supabase.co/")).toBe("https://abc.supabase.co/functions/v1/sadad-callback");
  });

  it("derives a plausible fallback email from the configured domain", () => {
    expect(fallbackEmail("example.qa")).toBe("noreply@example.qa");
    expect(fallbackEmail("https://www.example.qa/")).toBe("noreply@www.example.qa");
    expect(fallbackEmail("MYSHOP")).toBe("noreply@myshop.invalid");
    expect(fallbackEmail(null)).toBe("noreply@example.invalid");
  });

  describe("resolveReturnBase", () => {
    it("prefers the configured site url", () => {
      expect(resolveReturnBase("https://www.example.qa/", "https://other.example")).toBe("https://www.example.qa");
    });
    it("falls back to the origin the order was placed from", () => {
      expect(resolveReturnBase(null, "https://shop.lovable.app")).toBe("https://shop.lovable.app");
      expect(resolveReturnBase("", "http://localhost:8080")).toBe("http://localhost:8080");
    });
    it.each([
      "javascript:alert(1)",
      "http://evil.example",
      "https://evil.example/path?x=1",
      "data:text/html,hi",
      "//evil.example",
      "not a url",
    ])("refuses an unsafe origin %s", (origin) => {
      expect(resolveReturnBase(null, origin)).toBeNull();
    });
    it("returns null when nothing usable is known", () => {
      expect(resolveReturnBase(null, null)).toBeNull();
    });
  });
});

describe("n8n payloads", () => {
  const customer = { id: "c1", name: "Ahmed", email: "a@b.qa", phone: "5551 2345", country_code: "+974" };
  const order = { id: "o1", booking_reference: "QTR-AAA", total_amount: 250, payment_status: "pending" };
  const holders = [
    { name: "Ahmed", phone: "+974 5551 2345", country_code: "+974", nationality: "قطر", ticket_type: "vip", qr_code: "QTR-AAA-TKT01", qr_image_url: "https://x/q.png", id_number: "1" },
    { name: "Sara", phone: "+966 5551 0001", country_code: "+966", nationality: "السعودية", ticket_type: "normal", qr_code: "QTR-AAA-TKT02", qr_image_url: null, id_number: "2" },
  ];

  it("keeps the shape the existing n8n workflow already receives for new orders", () => {
    const p = buildOrderCreatedPayload({ customer, order, holders, adminPhone: "+974 5550 0000", now: new Date("2026-10-09T10:00:00Z") });
    expect(p.bookingReference).toBe("QTR-AAA");
    expect(p.customer).toMatchObject({ name: "Ahmed", phone: "97455512345" });
    expect(p.order).toMatchObject({ booking_reference: "QTR-AAA" });
    expect(p.adminPhone).toBe("97455500000");
    expect(p.timestamp).toBe("2026-10-09T10:00:00.000Z");
    expect(p.ticketHolders).toHaveLength(2);
  });

  it("formats each holder's phone with ITS OWN country code (the old code forced 974)", () => {
    const p = buildOrderCreatedPayload({ customer, order, holders, adminPhone: null });
    expect(p.ticketHolders[0].phone).toBe("97455512345");
    expect(p.ticketHolders[1].phone).toBe("96655510001");
    expect(p.adminPhone).toBeNull();
  });

  it("keeps qr_code as the ticket CODE and adds the picture as qr_code_image (the convention the admin screens already use)", () => {
    const p = buildOrderCreatedPayload({ customer, order, holders, adminPhone: null });
    expect(p.ticketHolders[0]).toMatchObject({ qr_code: "QTR-AAA-TKT01", qr_code_image: "https://x/q.png" });
    expect(p.ticketHolders[1]).toMatchObject({ qr_code: "QTR-AAA-TKT02", qr_code_image: null });
  });
  describe("paid-order payload (same shape the admin 'confirm payment' button has always sent)", () => {
    const paid = () =>
      buildOrderPaidPayload({
        customer,
        event: { title: "Festival", location: "Doha" },
        order: { ...order, payment_status: "confirmed", payment_id: "SD-1" },
        holders: holders.map((h) => ({ ...h, is_present: false })),
        prices: { vip: 200, normal: 50 },
        transactionNumber: "SD-1",
        now: new Date("2026-10-09T10:00:00Z"),
      });

    it("is the order row plus its customers / events / ticket_holders, tagged payment_confirmed", () => {
      const p = paid();
      expect(p).toMatchObject({
        booking_reference: "QTR-AAA",
        payment_status: "confirmed",
        action: "payment_confirmed",
        timestamp: "2026-10-09T10:00:00.000Z",
        customers: { name: "Ahmed" },
        events: { title: "Festival" },
      });
      expect(p.ticket_holders).toHaveLength(2);
    });

    it("keeps qr_code as the picture URL when one exists (what the workflow reads), and adds explicit fields", () => {
      const [first, second] = paid().ticket_holders;
      expect(first).toMatchObject({ qr_code: "https://x/q.png", qr_code_text: "QTR-AAA-TKT01", qr_code_image: "https://x/q.png" });
      expect(second).toMatchObject({ qr_code: "QTR-AAA-TKT02", qr_code_text: "QTR-AAA-TKT02", qr_code_image: null });
    });

    it("passes the holder rows through unchanged and adds a ready-to-use international phone number", () => {
      const [first, second] = paid().ticket_holders;
      expect(first).toMatchObject({ phone: "+974 5551 2345", country_code: "+974", phone_international: "97455512345" });
      expect(second).toMatchObject({ phone: "+966 5551 0001", phone_international: "96655510001" });
    });

    it("includes each ticket's price and the Sadad transaction", () => {
      const p = paid();
      expect(p.ticket_holders[0]).toMatchObject({ ticket_type: "vip", ticket_price: 200 });
      expect(p.ticket_holders[1]).toMatchObject({ ticket_type: "normal", ticket_price: 50 });
      expect(p.sadad_response).toEqual({ transaction_number: "SD-1" });
    });

    it("also exposes singular customer / event for consumers written against the older shape", () => {
      const p = paid();
      expect(p.customer).toMatchObject({ name: "Ahmed" });
      expect(p.event).toMatchObject({ title: "Festival" });
    });
  });
  describe("postWebhook", () => {
    it("posts JSON and reports success", async () => {
      let seen: { url: string; init: RequestInit } | null = null;
      const res = await postWebhook(
        async (url, init) => {
          seen = { url: String(url), init: init as RequestInit };
          return new Response("ok", { status: 200 });
        },
        "https://n8n.example/hook",
        { a: 1 },
      );
      expect(res).toEqual({ ok: true, status: 200 });
      expect(seen!.url).toBe("https://n8n.example/hook");
      expect(JSON.parse(seen!.init.body as string)).toEqual({ a: 1 });
      expect((seen!.init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });

    it("never throws: network errors and non-2xx are reported", async () => {
      expect(await postWebhook(async () => { throw new Error("boom"); }, "https://n8n.example/hook", {})).toMatchObject({ ok: false });
      expect(await postWebhook(async () => new Response("no", { status: 404 }), "https://n8n.example/hook", {})).toEqual({ ok: false, status: 404 });
    });

    it("refuses non-http(s) urls", async () => {
      expect(await postWebhook(async () => new Response("ok"), "file:///etc/passwd", {})).toMatchObject({ ok: false });
    });
  });
});

describe("qr", () => {
  it("accepts safe object names and rejects path tricks", () => {
    expect(qrObjectName("QTR-ABC123DEF456-TKT01")).toBe("QTR-ABC123DEF456-TKT01.png");
    expect(qrObjectName("POS-AAA-TKT10")).toBe("POS-AAA-TKT10.png");
    for (const bad of ["../secret", "a/b", "a b", "", "x".repeat(200), ".hidden", "a.png", "ünï"]) {
      expect(qrObjectName(bad)).toBeNull();
    }
  });

  const fakePng = new Uint8Array([137, 80, 78, 71]);

  it("renders locally when the library is available", async () => {
    const gen = makeQrGenerator({
      loadLib: async () => ({ toBuffer: async (text: string) => new Uint8Array([...fakePng, text.length]) }),
      fetch: async () => { throw new Error("must not be called"); },
    });
    expect(Array.from(await gen("HELLO"))).toEqual([137, 80, 78, 71, 5]);
  });

  it("falls back to the QR web service when the library cannot load", async () => {
    let requested = "";
    const gen = makeQrGenerator({
      loadLib: async () => { throw new Error("no npm support"); },
      fetch: async (url) => {
        requested = String(url);
        return new Response(fakePng, { status: 200 });
      },
    });
    expect(Array.from(await gen("A B&C"))).toEqual(Array.from(fakePng));
    expect(requested).toContain("api.qrserver.com");
    expect(requested).toContain(encodeURIComponent("A B&C"));
  });

  it("fails clearly when neither works", async () => {
    const gen = makeQrGenerator({
      loadLib: async () => { throw new Error("x"); },
      fetch: async () => new Response("nope", { status: 500 }),
    });
    await expect(gen("T")).rejects.toThrow(/QR/);
  });
});

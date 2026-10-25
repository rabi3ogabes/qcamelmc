import { describe, expect, it } from "vitest";
import { chooseTemplate, whatsappInvoicePayload } from "../../supabase/functions/_shared/whatsapp-invoice";
import { callbackOutcome, deliveryCounts } from "../../supabase/functions/_shared/invoice-delivery";
import { sendToWebhookHandler } from "../../supabase/functions/send-to-webhook/handler";
import { makeRepo, configuredSettings, fn, post } from "./helpers";
import type { OrderContext } from "../../supabase/functions/_shared/repo";

const templates = [
  { id: "a", name: "First", body: "Hello {{customer_name}} {{invoice_url}}", enabled: true },
  { id: "off", name: "Disabled", body: "Disabled", enabled: false },
  { id: "b", name: "Second", body: "Booking {{booking_reference}}", enabled: true },
];
const context = { order: { id: "order-1", booking_reference: "QTR-7-11-2026-9A657F69875B", payment_status: "confirmed", total_amount: 3 }, customer: { name: "Ahmed", phone: "55512345", country_code: "+974" }, event: { is_archived: true, title: "Festival" }, holders: [{ qr_code: "ticket-code", qr_image_url: "https://example.com/ticket.png", ticket_type: "vip" }], prices: { vip: 3 } } as OrderContext;

describe("manual invoice delivery rules", () => {
  it("randomly selects among enabled templates on every send", () => {
    expect(chooseTemplate(templates, () => 0)?.id).toBe("a");
    expect(chooseTemplate(templates, () => 0.99)?.id).toBe("b");
    expect(chooseTemplate(templates.filter(t => !t.enabled))).toBeNull();
  });
  it("renders customer fields and uses stored QR images, never fabricated image paths", () => {
    const payload = whatsappInvoicePayload(context, templates, "delivery-1", () => 0);
    expect(payload.whatsapp_message).toBe("Hello Ahmed https://www.qcamelmc.org/invoice/QTR-7-11-2026-9A657F69875B");
    expect(payload.qr_codes).toEqual(["https://example.com/ticket.png"]);
    expect(payload.customer_phone_whatsapp).toBe("97455512345");
  });
  it("counts WhatsApp and email independently and preserves repeated sends", () => {
    const rows = [{ id: "1", channel: "email", status: "sent", attempt: 1 }, { id: "2", channel: "email", status: "sent", attempt: 1 }, { id: "3", channel: "email", status: "sent", attempt: 2 }, { id: "4", channel: "whatsapp", status: "sent", attempt: 1 }, { id: "5", channel: "whatsapp", status: "sent", attempt: 1 }, { id: "6", channel: "whatsapp", status: "queued", attempt: 1 }];
    expect(deliveryCounts(rows, "email")).toEqual({ sent: 2, queued: 0, failed: 0 });
    expect(deliveryCounts(rows, "whatsapp")).toEqual({ sent: 2, queued: 1, failed: 0 });
  });
  it("only explicit success confirms delivery", () => {
    expect(callbackOutcome("success")).toBe("sent");
    expect(callbackOutcome("failed")).toBe("failed");
    expect(callbackOutcome(undefined)).toBe("failed");
  });
  it("admin can send and resend the named archived booking without overwriting history", async () => {
    const logs: Record<string, unknown>[] = [];
    const bodies: Record<string, unknown>[] = [];
    const repo = makeRepo({ context, settings: configuredSettings({ whatsappTemplates: templates }), createInvoiceDelivery: async row => { logs.push(row); } });
    const handler = sendToWebhookHandler({ repo, auth: repo, fetch: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response("accepted"); }) as typeof fetch });
    for (let i = 0; i < 2; i++) {
      const res = await handler(post(fn("send-to-webhook"), { action: "send_invoice", booking_reference: context.order.booking_reference, customer_name: "FORGED" }, { authorization: "Bearer admin-jwt" }));
      expect(await res.json()).toMatchObject({ success: true, message: "جاري الإرسال إلى واتساب..." });
    }
    expect(logs).toHaveLength(2);
    expect(logs[0].delivery_id).not.toBe(logs[1].delivery_id);
    expect(logs.every(row => row.status === "queued" && row.channel === "whatsapp")).toBe(true);
    expect(bodies.every(body => body.customer_name === "Ahmed")).toBe(true);
  });
  it("rejects unpaid invoice sends", async () => {
    const repo = makeRepo({ context: { ...context, order: { ...context.order, payment_status: "pending" } } });
    const handler = sendToWebhookHandler({ repo, auth: repo, fetch });
    expect((await handler(post(fn("send-to-webhook"), { action: "send_invoice", booking_reference: context.order.booking_reference }, { authorization: "Bearer admin-jwt" }))).status).toBe(400);
  });
});
import { describe, expect, it, vi } from "vitest";
import { sendWhatsAppInvoice } from "../../supabase/functions/_shared/send-whatsapp-invoice";
import { sendToWebhookHandler } from "../../supabase/functions/send-to-webhook/handler";
import { makeProcessorDeps } from "../../supabase/functions/_shared/payment-wiring";
import { whatsappInvoiceRejection } from "../../supabase/functions/_shared/whatsapp-eligibility";
import { configuredSettings, fn, makeRepo, post } from "./helpers";
import type { OrderContext } from "../../supabase/functions/_shared/repo";

const now = new Date("2026-11-08T11:54:00Z");
const online = { order: { id: "o1", booking_reference: "QTR-8-11-2026-abc", payment_method: "sadad", payment_status: "confirmed", total_amount: 300 }, customer: { name: "Ahmed", phone: "55512345" }, event: { event_date: "2026-11-08T06:00:00Z", is_archived: false }, holders: [], prices: {} } as OrderContext;
const pos = { ...online, order: { ...online.order, payment_method: "cash_pos", booking_reference: "POS-8-11-2026-abc" } };
const admin = { authorization: "Bearer admin-jwt" };
function setup(context: OrderContext) {
  const attempt = vi.fn(async () => {});
  const fetch = vi.fn(async () => new Response("accepted"));
  const repo = makeRepo({ context, createInvoiceDelivery: attempt });
  return { repo, attempt, fetch };
}

describe("server-side WhatsApp invoice eligibility", () => {
  it.each([false, true])("blocks POS before attempts and HTTP, automatic=%s", async automatic => {
    const deps = setup(pos);
    await expect(sendWhatsAppInvoice({ ...deps, reference: pos.order.booking_reference, automatic, now })).rejects.toMatchObject({ code: "pos_order" });
    expect(deps.attempt).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.repo.calls.pending).toEqual([]);
  });
  it.each(["send_invoice", "send_ticket", "payment_confirmed", "retry"])("rejects POS through legacy/countdown trigger %s", async action => {
    const deps = setup(pos);
    const handler = sendToWebhookHandler({ ...deps, auth: deps.repo });
    const res = await handler(post(fn("send-to-webhook"), { action, notify: action, automatic: true, booking_reference: pos.order.booking_reference, payment_method: "sadad" }, admin));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("pos_order");
    expect(deps.attempt).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("payment callbacks do not send POS to WhatsApp", async () => {
    const deps = setup(pos);
    await makeProcessorDeps({ ...deps, settings: configuredSettings(), now: () => now }).onConfirmed?.(pos.order);
    expect(deps.attempt).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("eligible current QTR sends remain queued until provider confirmation", async () => {
    const deps = setup(online);
    expect(await sendWhatsAppInvoice({ ...deps, reference: online.order.booking_reference, automatic: true, now })).toMatchObject({ success: true, queued: true });
    expect(deps.attempt).toHaveBeenCalledWith(expect.objectContaining({ status: "queued", channel: "whatsapp" }));
    expect(deps.fetch).toHaveBeenCalledOnce();
  });
  it("a QTR prefix cannot override stored POS method", () => {
    expect(whatsappInvoiceRejection({ ...online.order, payment_method: "cash_pos" }, online.event, true, now)).toBe("pos_order");
  });
  it("a Sadad method cannot override a POS reference", () => {
    expect(whatsappInvoiceRejection({ ...online.order, booking_reference: pos.order.booking_reference }, online.event, true, now)).toBe("pos_order");
  });
  it("archive exception is manual only", () => {
    expect(whatsappInvoiceRejection(online.order, { ...online.event, is_archived: true }, true, now)).toBe("unavailable_event");
    expect(whatsappInvoiceRejection(online.order, { ...online.event, is_archived: true }, false, now)).toBeNull();
  });
  it("automatic invoices stop at 18:00 Qatar", () => {
    expect(whatsappInvoiceRejection(online.order, online.event, true, new Date("2026-11-08T14:59:59Z"))).toBeNull();
    expect(whatsappInvoiceRejection(online.order, online.event, true, new Date("2026-11-08T15:00:00Z"))).toBe("event_ended");
  });
  it("manually confirmed invoices are excluded from automatic retries", () => {
    expect(whatsappInvoiceRejection({ ...online.order, whatsapp_manually_confirmed_at: now.toISOString() }, online.event, true, now)).toBe("manually_confirmed");
  });
});
import type { Repo } from "./repo.ts";
import { whatsappInvoicePayload } from "./whatsapp-invoice.ts";
import { whatsappInvoiceRejection } from "./whatsapp-eligibility.ts";
import { postWebhook } from "./notify.ts";
import { HttpError } from "./http.ts";

/** Every WhatsApp attempt re-reads trusted order data before logging or posting. */
export async function sendWhatsAppInvoice(args: {
  repo: Repo; fetch: typeof fetch; reference: string; automatic: boolean; now?: Date; timeoutMs?: number;
}) {
  const { repo, reference, automatic } = args;
  const context = await repo.getOrderContext(reference);
  if (!context) throw new HttpError(404, "order_not_found", "Booking not found");
  const reason = whatsappInvoiceRejection(context.order, context.event, automatic, args.now);
  if (reason) {
    if (reason === "pos_order" || reason === "not_confirmed") throw new HttpError(400, reason, "Invoices require a confirmed online QTR booking");
    return { success: true, skipped: true, reason };
  }
  const settings = await repo.getPrivateSettings();
  if (!settings.webhookUrl) throw new HttpError(400, "webhook_not_configured", "Webhook URL not configured");
  const deliveryId = crypto.randomUUID();
  const invoice = whatsappInvoicePayload(context, settings.whatsappTemplates ?? [], deliveryId);
  await repo.createInvoiceDelivery({ order_id: context.order.id, booking_reference: reference, channel: "whatsapp", template: "whatsapp-invoice", status: "queued", attempt: 1, recipient: invoice.customer_phone_whatsapp, message_body: invoice.whatsapp_message, template_name: invoice.template_name, delivery_id: deliveryId });
  await repo.markAutomationPending({ orderId: context.order.id, bookingReference: reference, message: "جاري الإرسال إلى واتساب..." });
  const result = await postWebhook(args.fetch, settings.webhookUrl, invoice, args.timeoutMs);
  if (!result.ok) await repo.updateInvoiceDelivery(deliveryId, "failed", `Webhook failed${result.status ? ` (HTTP ${result.status})` : ""}`);
  return { success: result.ok, queued: result.ok, delivery_id: deliveryId, message: result.ok ? "جاري الإرسال إلى واتساب..." : "Webhook request failed" };
}
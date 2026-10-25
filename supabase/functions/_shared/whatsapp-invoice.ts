import type { OrderContext } from "./repo.ts";
import type { WhatsAppTemplate } from "./settings.ts";
import { formatPhone } from "./notify.ts";

export function chooseTemplate(templates: WhatsAppTemplate[], random = Math.random): WhatsAppTemplate | null {
  const active = templates.filter(t => t.enabled && t.body.trim());
  return active[Math.min(active.length - 1, Math.floor(random() * active.length))] ?? null;
}

export function whatsappInvoicePayload(context: OrderContext, templates: WhatsAppTemplate[], deliveryId: string, random = Math.random) {
  const { order, customer, event, holders } = context;
  const template = chooseTemplate(templates, random);
  const invoiceUrl = `https://www.qcamelmc.org/invoice/${encodeURIComponent(String(order.booking_reference))}`;
  const values: Record<string, string> = {
    customer_name: String(customer.name ?? ""), booking_reference: String(order.booking_reference),
    event_title: String(event.title ?? ""), event_date: event.event_date ? new Date(String(event.event_date)).toLocaleDateString("ar-u-nu-latn", { timeZone: "Asia/Qatar" }) : "",
    event_location: String(event.location ?? ""), quantity: String(holders.length), total_amount: String(order.total_amount), invoice_url: invoiceUrl,
  };
  const message = template?.body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] ?? match) ?? null;
  return {
    order_id: order.id, booking_reference: order.booking_reference, customer_name: customer.name,
    customer_phone: customer.phone, customer_phone_whatsapp: formatPhone(customer.phone, customer.country_code),
    customer_email: customer.email, nationality: customer.nationality, customers: customer,
    ticket_type: order.ticket_type, quantity: holders.length, total_quantity: holders.length,
    total_amount: order.total_amount, payment_status: order.payment_status,
    qr_codes: holders.map(h => h.qr_image_url ?? (String(h.qr_code ?? "").startsWith("https://") ? h.qr_code : null)).filter(Boolean),
    ticket_types: holders.map(h => h.ticket_type), event_title: event.title, event_date: event.event_date,
    event_location: event.location, created_at: order.created_at,
    invoice_url: invoiceUrl, delivery_id: deliveryId, channel: "whatsapp", action: "send_invoice",
    whatsapp_message: message, message, template_id: template?.id ?? null, template_name: template?.name ?? null,
  };
}
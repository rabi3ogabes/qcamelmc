import { isOrderFestivalDate } from "./orders-policy.ts";

export function whatsappInvoiceRejection(
  order: Record<string, unknown>, event: Record<string, unknown>, automatic = false, now = new Date(),
): string | null {
  if (order.payment_method !== "sadad" || !String(order.booking_reference ?? "").startsWith("QTR-")) return "pos_order";
  if (order.payment_status !== "confirmed") return "not_confirmed";
  if (!automatic) return null;
  if (order.whatsapp_manually_confirmed_at) return "manually_confirmed";
  const date = String(event.event_date ?? "");
  if (event.is_archived === true || !isOrderFestivalDate(date)) return "unavailable_event";
  // Calendar date in Qatar; 18:00 on that day is the automatic invoice cutoff.
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
  if (now.getTime() >= Date.parse(`${day}T18:00:00+03:00`)) return "event_ended";
  return null;
}
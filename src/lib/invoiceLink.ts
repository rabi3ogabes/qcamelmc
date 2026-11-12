/**
 * The public invoice page for a booking reference.
 *
 * The same URL is what customers receive by email/WhatsApp, so opening it from
 * the invoices page shows exactly what the customer sees.
 */
export const invoicePageUrl = (bookingReference: string): string =>
  `/invoice/${encodeURIComponent(String(bookingReference).trim())}`;

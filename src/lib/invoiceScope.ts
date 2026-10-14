/**
 * Scope rule for the invoice sending page.
 *
 * Only invoices of the live (available) season may be listed or sent.
 * Events that belong to an archived season are never shown here — the data
 * stays in the database, but the page treats it as out of scope.
 */

export interface InvoiceEventScope {
  id: string;
  is_archived?: boolean | null;
}

/** An event is available for invoicing unless its season was explicitly archived. */
export const isAvailableInvoiceEvent = (
  event: InvoiceEventScope | null | undefined
): boolean => !!event && event.is_archived !== true;

/** Ids of the events the invoice page is allowed to load, in the given order. */
export const availableInvoiceEventIds = (
  events: Array<InvoiceEventScope | null | undefined>
): string[] => events.filter(isAvailableInvoiceEvent).map((event) => event!.id);

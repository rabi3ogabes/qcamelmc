// Translate the error codes raised by public.create_order() into HTTP errors.

import { HttpError } from "./http.ts";

const MESSAGES: Record<string, [number, string]> = {
  quantity_limit_exceeded: [422, "Too many tickets for one order"],
  below_minimum_amount: [422, "The total is below the minimum online payment amount"],
  event_not_available: [409, "This event is not open for booking"],
  invalid_tickets: [422, "One or more tickets are invalid"],
  holders_mismatch: [422, "Each ticket needs its own holder"],
  invalid_request: [400, "The order request is invalid"],
  forbidden: [403, "Not allowed"],
};

export function mapOrderError(message: string | null | undefined): HttpError | null {
  const text = (message ?? "").trim();
  const stock = /^insufficient_stock:(\w+)$/.exec(text);
  if (stock) return new HttpError(409, "insufficient_stock", "Not enough tickets left", { ticket_type: stock[1] });
  const known = MESSAGES[text];
  return known ? new HttpError(known[0], text, known[1]) : null;
}

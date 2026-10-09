// Server-side validation of the order payload. The browser is never trusted:
// prices, totals, statuses and event ids are not accepted from the client at
// all — only *which* tickets and *who* will use them.

export type PaymentMethod = "sadad" | "cash_pos";

export interface OrderCustomer {
  name: string;
  email: string;
  phone: string;
  country_code: string;
  nationality: string;
  id_number: string;
}

export interface OrderItem {
  ticket_id: string;
  quantity: number;
}

export interface OrderHolder {
  ticket_id: string;
  name: string;
  phone: string;
  nationality: string;
  id_number: string;
}

export interface CreateOrderInput {
  customer: OrderCustomer;
  items: OrderItem[];
  holders: OrderHolder[];
  payment_method: PaymentMethod;
}

export type ParseResult =
  | { ok: true; value: CreateOrderInput }
  | { ok: false; errors: string[] };

export const MAX_ITEMS_PER_ORDER = 6;
export const MAX_TICKETS_PER_ORDER = 30;
export const MAX_QUANTITY_PER_ITEM = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_CHARS = /^[+\d\s\-()]+$/;
const COUNTRY_CODE = /^\+\d{1,4}$/;
const ID_NUMBER = /^[\p{L}\p{N}\-_/ ]{3,30}$/u;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const clean = (v: unknown): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";

function text(
  errors: string[],
  label: string,
  value: unknown,
  { min = 1, max = 100 }: { min?: number; max?: number } = {},
): string {
  const raw = typeof value === "string" ? value : "";
  const s = clean(raw);
  if (CONTROL_CHARS.test(raw)) errors.push(`${label} contains invalid characters`);
  else if (s.length < min) errors.push(`${label} is required`);
  else if (s.length > max) errors.push(`${label} is too long`);
  return s;
}

function phone(errors: string[], label: string, value: unknown): string {
  const s = clean(value);
  const digits = s.replace(/\D/g, "");
  if (!PHONE_CHARS.test(s) || digits.length < 6 || digits.length > 15) {
    errors.push(`${label} phone number is invalid`);
  }
  return s;
}

function idNumber(errors: string[], label: string, value: unknown): string {
  const s = clean(value);
  if (!ID_NUMBER.test(s)) errors.push(`${label} ID number is invalid`);
  return s;
}

export function parseCreateOrderInput(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, errors: ["Request body must be a JSON object"] };
  const errors: string[] = [];

  // --- customer -----------------------------------------------------------
  const c = isRecord(body.customer) ? body.customer : {};
  if (!isRecord(body.customer)) errors.push("Customer details are required");
  const emailRaw = clean(c.email);
  if (emailRaw && (emailRaw.length > 254 || !EMAIL.test(emailRaw))) errors.push("Customer email is invalid");
  const countryRaw = clean(c.country_code) || "+974";
  if (!COUNTRY_CODE.test(countryRaw)) errors.push("Customer country code is invalid");
  const customer: OrderCustomer = {
    name: text(errors, "Customer name", c.name, { min: 2 }),
    email: emailRaw,
    phone: phone(errors, "Customer", c.phone),
    country_code: COUNTRY_CODE.test(countryRaw) ? countryRaw : "+974",
    nationality: text(errors, "Customer nationality", c.nationality, { max: 60 }),
    id_number: idNumber(errors, "Customer", c.id_number),
  };

  // --- items --------------------------------------------------------------
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) errors.push("At least one ticket is required");
  if (rawItems.length > MAX_ITEMS_PER_ORDER) errors.push("Too many ticket types in one order");

  const items: OrderItem[] = [];
  const seen = new Set<string>();
  let totalTickets = 0;
  for (const raw of rawItems.slice(0, MAX_ITEMS_PER_ORDER)) {
    const item = isRecord(raw) ? raw : {};
    const ticketId = typeof item.ticket_id === "string" ? item.ticket_id.toLowerCase() : "";
    const quantity = item.quantity;
    if (!UUID.test(ticketId)) {
      errors.push("Ticket id is invalid");
      continue;
    }
    if (seen.has(ticketId)) {
      errors.push("Duplicate ticket type in order");
      continue;
    }
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > MAX_QUANTITY_PER_ITEM) {
      errors.push(`Quantity must be a whole number between 1 and ${MAX_QUANTITY_PER_ITEM}`);
      continue;
    }
    seen.add(ticketId);
    totalTickets += quantity as number;
    items.push({ ticket_id: ticketId, quantity: quantity as number });
  }
  if (totalTickets > MAX_TICKETS_PER_ORDER) errors.push(`An order may contain at most ${MAX_TICKETS_PER_ORDER} tickets`);

  // --- holders (one per ticket, matched to its ticket type) ---------------
  const rawHolders = Array.isArray(body.holders) ? body.holders : [];
  const holders: OrderHolder[] = [];
  rawHolders.slice(0, MAX_TICKETS_PER_ORDER).forEach((raw, index) => {
    const h = isRecord(raw) ? raw : {};
    const label = `Ticket ${index + 1}`;
    const ticketId = typeof h.ticket_id === "string" ? h.ticket_id.toLowerCase() : "";
    if (!UUID.test(ticketId)) errors.push(`${label}: ticket id is invalid`);
    holders.push({
      ticket_id: ticketId,
      name: text(errors, `${label} holder name`, h.name, { min: 2 }),
      phone: phone(errors, `${label} holder`, h.phone),
      nationality: text(errors, `${label} holder nationality`, h.nationality, { max: 60 }),
      id_number: idNumber(errors, `${label} holder`, h.id_number),
    });
  });

  if (items.length > 0 && errors.length === 0) {
    if (holders.length !== totalTickets) errors.push("Each ticket needs exactly one holder");
    for (const item of items) {
      const count = holders.filter((h) => h.ticket_id === item.ticket_id).length;
      if (count !== item.quantity) errors.push("Ticket holders do not match the selected tickets");
    }
  }

  // --- payment ------------------------------------------------------------
  const method = body.payment_method;
  if (method !== "sadad" && method !== "cash_pos") errors.push("Unsupported payment method");

  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };
  return { ok: true, value: { customer, items, holders, payment_method: method as PaymentMethod } };
}

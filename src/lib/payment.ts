// Hand the customer over to Sadad's hosted checkout, and remember which
// bookings this browser made so the result/confirmation pages can find them.

import type { SadadPayment } from "./api-client";

const SADAD_HOSTS = new Set(["sadadqa.com", "www.sadadqa.com", "secure.sadadqa.com"]);

function assertSadad(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Refusing to send payment details: invalid Sadad address");
  }
  if (parsed.protocol !== "https:" || !SADAD_HOSTS.has(parsed.hostname)) {
    throw new Error("Refusing to send payment details to an address that is not Sadad");
  }
}

/**
 * A hidden-field form that POSTs the signed request to Sadad. Values are set as
 * DOM properties (never concatenated into HTML), so nothing can break out of
 * an attribute. It targets the current window: Sadad sends the customer back
 * to the shop when the payment is done.
 */
export function buildPaymentForm(doc: Document, payment: SadadPayment): HTMLFormElement {
  assertSadad(payment.url);
  const form = doc.createElement("form");
  form.method = "post";
  form.action = payment.url;
  form.target = "_self";
  form.style.display = "none";
  for (const [name, value] of Object.entries(payment.fields)) {
    const input = doc.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  }
  return form;
}

/** Leave the shop for Sadad's payment page. */
export function redirectToSadad(payment: SadadPayment, doc: Document = document): void {
  const form = buildPaymentForm(doc, payment);
  doc.body.appendChild(form);
  form.submit();
}

// ---------------------------------------------------------------------------
// Bookings made in this browser (booking references are unguessable, so they
// double as the capability to look a booking up)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "orderRefs";
const KEEP = 10;

export function recallOrders(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function rememberOrder(reference: string): void {
  try {
    const next = [...recallOrders().filter((r) => r !== reference), reference].slice(-KEEP);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable (private mode): the result page also takes the reference from the URL */
  }
}

export function forgetOrders(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

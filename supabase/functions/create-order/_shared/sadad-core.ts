// AUTO-GENERATED COPY of supabase/functions/_shared/sadad-core.ts — do not edit here.
// Edit the original, then run "npm run sync:functions". Each function ships self-contained.

// Pure Sadad Web Checkout 2.1 helpers (request signing, callback verification,
// payload normalisation). No runtime-specific imports: runs in Deno (edge
// functions) and Node (vitest) using only Web Crypto + standard JS.
//
// Spec: https://developer.sadad.qa/web-checkout_2.1/

export const SADAD_CHECKOUT_URL = "https://sadadqa.com/webpurchase";

const ORDER_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;
const TXN_NUMBER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const encoder = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** PHP-style string conversion: null/false -> "", true -> "1", numbers as-is. */
function phpString(value: unknown): string {
  if (value === null || value === undefined || value === false) return "";
  if (value === true) return "1";
  return String(value);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Concatenate values ordered by key (byte order, like PHP ksort). */
function valuesByKey(params: Record<string, unknown>, skip: (key: string) => boolean): string {
  return Object.keys(params)
    .filter((key) => !skip(key))
    .sort()
    .map((key) => phpString(params[key]))
    .join("");
}

const isUnsignedRequestField = (key: string) =>
  key === "signature" || key === "checksumhash" || key.startsWith("productdetail");

/**
 * Request signature: SHA256(secret + values sorted by key), uppercase hex.
 * `signature` and `productdetail[...]` fields are never part of the hash.
 */
export async function signRequest(params: Record<string, string>, secret: string): Promise<string> {
  const hex = await sha256Hex(secret + valuesByKey(params, isUnsignedRequestField));
  return hex.toUpperCase();
}

/**
 * Verify the `checksumhash` Sadad sends with callbacks and webhooks:
 * SHA256(secret + values of all other params sorted by key), compared
 * case-insensitively.
 */
export async function verifyChecksum(
  payload: Record<string, unknown>,
  secret: string,
): Promise<boolean> {
  if (!payload || !secret) return false;
  const received = phpString(payload.checksumhash).trim().toLowerCase();
  if (!received) return false;
  const expected = await sha256Hex(secret + valuesByKey(payload, (key) => key === "checksumhash"));
  return timingSafeEqual(expected, received);
}

const toCents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);

const formatCents = (cents: number) =>
  `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

/** Two-decimal string for a positive, finite amount. */
export function formatAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount");
  return formatCents(toCents(amount));
}

/** True when both values are numbers that agree to the cent. */
export function amountsMatch(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === "string" && a.trim() === "") return false;
  if (typeof b === "string" && b.trim() === "") return false;
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return toCents(x) === toCents(y);
}

/** Digits only, with country code, as required by Sadad (e.g. 97455512345). */
export function toSadadMobile(phone: string, countryCode: string): string {
  const cc = (countryCode ?? "").replace(/\D/g, "") || "974";
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // "+966 …" is already international: its own country code wins over the record's default
  if ((phone ?? "").trim().startsWith("+")) return digits;
  if (digits.startsWith(cc) && digits.length - cc.length >= 7) return digits;
  return cc + digits.replace(/^0+/, "");
}

/** Calendar date in Qatar (UTC+3) as YYYY-MM-DD. */
function qatarDate(now: Date): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface CheckoutItem {
  name: string;
  price: number;
  quantity: number;
}

export interface CheckoutRequestInput {
  merchantId: string;
  secret: string;
  orderId: string;
  amount: number;
  website: string;
  callbackUrl: string;
  mobile: string;
  email: string;
  now?: Date;
  items?: CheckoutItem[];
}

export interface CheckoutRequest {
  url: string;
  fields: Record<string, string>;
}

/** Build the signed hidden-field set to POST to Sadad's hosted checkout. */
export async function buildCheckoutRequest(input: CheckoutRequestInput): Promise<CheckoutRequest> {
  if (!input.secret) throw new Error("Sadad secret key is not configured");
  if (!input.merchantId) throw new Error("Sadad merchant id is not configured");
  if (!input.website) throw new Error("Sadad website is not configured");
  if (!input.callbackUrl.startsWith("https://")) throw new Error("Callback URL must use https");
  const amount = formatAmount(input.amount);

  const signed: Record<string, string> = {
    merchant_id: input.merchantId,
    ORDER_ID: input.orderId,
    TXN_AMOUNT: amount,
    WEBSITE: input.website,
    CALLBACK_URL: input.callbackUrl,
    MOBILE_NO: input.mobile,
    EMAIL: input.email,
    txnDate: qatarDate(input.now ?? new Date()),
  };

  const fields: Record<string, string> = { ...signed, signature: await signRequest(signed, input.secret) };

  (input.items ?? []).forEach((item, index) => {
    fields[`productdetail[${index}][order_id]`] = input.orderId;
    fields[`productdetail[${index}][itemname]`] = item.name;
    fields[`productdetail[${index}][amount]`] = formatAmount(item.price);
    fields[`productdetail[${index}][quantity]`] = String(item.quantity);
  });

  return { url: SADAD_CHECKOUT_URL, fields };
}

export type NormalizedStatus = "success" | "failed" | "in_progress" | "unknown";

export interface NormalizedPayment {
  orderRef: string;
  transactionNumber: string | null;
  status: NormalizedStatus;
  amount: number | null;
  sandbox: boolean | null;
}

const pick = (payload: Record<string, unknown>, ...keys: string[]): string => {
  for (const key of keys) {
    const value = payload[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") return String(value).trim();
  }
  return "";
};

function statusFromCode(code: string): NormalizedStatus {
  if (code === "3") return "success";
  if (code === "2" || code === "7") return "failed";
  if (code === "1" || code === "5" || code === "6") return "in_progress";
  return "unknown";
}

function statusFromText(text: string): NormalizedStatus {
  if (text === "TXN_SUCCESS") return "success";
  if (text === "TXN_FAILURE") return "failed";
  return "unknown";
}

/**
 * Understands both the form-encoded callback (ORDERID, transaction_status, ...)
 * and the JSON webhook (websiteRefNo, transactionStatus, ...). Anything that is
 * not an explicit success code is never reported as success.
 */
export function normalizePaymentPayload(payload: Record<string, unknown>): NormalizedPayment | null {
  if (!payload || typeof payload !== "object") return null;

  const orderRef = pick(payload, "ORDERID", "ORDER_ID", "website_ref_no", "websiteRefNo");
  if (!ORDER_REF_PATTERN.test(orderRef)) return null;

  const code = pick(payload, "transaction_status", "transactionStatus");
  const status = code ? statusFromCode(code) : statusFromText(pick(payload, "STATUS"));

  const transactionNumber = pick(payload, "transaction_number", "transactionNumber");
  const rawAmount = pick(payload, "TXNAMOUNT", "txnAmount");
  const amount = rawAmount !== "" && Number.isFinite(Number(rawAmount)) ? Number(rawAmount) : null;
  const sandboxRaw = pick(payload, "issandboxmode", "isTestMode");

  return {
    orderRef,
    transactionNumber: TXN_NUMBER_PATTERN.test(transactionNumber) ? transactionNumber : null,
    status,
    amount,
    sandbox: sandboxRaw === "" ? null : sandboxRaw === "1",
  };
}

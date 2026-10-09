// Data access for the edge functions. Deliberately thin: every business rule
// lives in the tested SQL functions (create_order, confirm_order_payment, ...)
// or in pure modules, so this file only maps calls onto them.

import type { AuthDeps } from "./auth.ts";
import { mapOrderError } from "./order-errors.ts";
import type { PaymentEvent, PaymentOrder } from "./payment-processor.ts";
import type { SadadEnvironment } from "./sadad-api.ts";
import type { PrivateSettings } from "./settings.ts";

type Row = Record<string, unknown>;

/* eslint-disable @typescript-eslint/no-explicit-any --
 * The query builder's generic types are huge and differ between the browser and Deno builds; the
 * repository below is the only place that touches them and every call maps 1:1 onto tested SQL. */

/** The slice of the Supabase client we use (kept structural so tests and Deno can both satisfy it). */
export interface SupabaseLike {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): any;
  storage: { from(bucket: string): any };
  auth: { getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
}

export interface CreateOrderArgs {
  customer: Row;
  items: Row[];
  holders: Row[];
  paymentMethod: "sadad" | "cash_pos";
  source: "web" | "pos";
  actor: string | null;
  returnOrigin: string | null;
}

export interface CreatedOrder {
  order_id: string;
  booking_reference: string;
  total_amount: number;
  payment_method: "sadad" | "cash_pos";
  payment_status: string;
  payment_expires_at: string | null;
  event_id: string;
  items: { ticket_id: string; type: string; price: number; quantity: number }[];
  holders: { id: string; qr_code: string; ticket_type: string; name: string }[];
}

export interface OrderContext {
  order: Row & PaymentOrder;
  customer: Row;
  event: Row;
  holders: Row[];
  prices: Record<string, number>;
}

export interface CheckInResult {
  result: "checked_in" | "already_present" | "payment_not_confirmed" | "not_found";
  ticket?: Row;
}

export interface Repo extends AuthDeps {
  getPrivateSettings(): Promise<PrivateSettings>;
  createOrder(args: CreateOrderArgs): Promise<CreatedOrder>;
  /** Unpaid orders of this phone number that still hold seats (pending and not yet expired). */
  countOpenOrders(phone: string): Promise<number>;
  setQrImageUrl(holderId: string, url: string): Promise<void>;
  getPaymentOrder(ref: string): Promise<PaymentOrder | null>;
  getOrderContext(ref: string): Promise<OrderContext | null>;
  confirmOrderPayment(ref: string, transactionNumber: string): Promise<{ result: string }>;
  failOrderPayment(ref: string, note: string): Promise<{ result: string }>;
  claimPaymentCheck(ref: string): Promise<{ order_id: string } | null>;
  logPaymentEvent(event: PaymentEvent): Promise<void>;
  checkInTicket(code: string, adminId: string | null): Promise<CheckInResult>;
  listHoldersMissingQrImage(limit: number): Promise<{ id: string; qr_code: string }[]>;
  listBookingHolders(ref: string): Promise<{ id: string; qr_code: string }[] | null>;
}

export interface QrStorage {
  /** Upload (overwriting) a PNG and return its public URL. */
  uploadPng(objectName: string, png: Uint8Array): Promise<string>;
}

const BUCKET = "qr-codes";

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

function toEnvironment(value: unknown): SadadEnvironment {
  return value === "sandbox" || value === "live" ? value : "auto";
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

export function createRepo(sb: SupabaseLike): Repo {
  return {
    async getUserId(jwt) {
      const { data, error } = await sb.auth.getUser(jwt);
      return error || !data.user ? null : data.user.id;
    },

    async isAdmin(userId) {
      const { data, error } = await sb.from("admin_users").select("id").eq("id", userId).maybeSingle();
      if (error) fail("admin lookup", error);
      return Boolean(data);
    },

    async getPrivateSettings() {
      const { data, error } = await sb.from("private_settings").select("*").limit(1).maybeSingle();
      if (error) fail("settings lookup", error);
      const row = (data ?? {}) as Row;
      return {
        webhookUrl: text(row.webhook_url),
        adminPhone: text(row.admin_phone),
        merchantId: text(row.sadad_merchant_id),
        secret: text(row.sadad_secret),
        apiKey: text(row.sadad_api_key),
        websiteDomain: text(row.sadad_website_domain),
        environment: toEnvironment(row.sadad_environment),
        siteUrl: text(row.site_url),
      };
    },

    async createOrder(a) {
      const { data, error } = await sb.rpc("create_order", {
        p_customer: a.customer,
        p_items: a.items,
        p_holders: a.holders,
        p_payment_method: a.paymentMethod,
        p_source: a.source,
        p_actor: a.actor,
        p_return_origin: a.returnOrigin,
      });
      if (error) throw mapOrderError(error.message) ?? new Error(`create_order: ${error.message}`);
      return data as CreatedOrder;
    },

    async countOpenOrders(phone) {
      const { count, error } = await sb
        .from("orders")
        .select("id, customers!inner(phone)", { count: "exact", head: true })
        .eq("payment_status", "pending")
        .or(`payment_expires_at.is.null,payment_expires_at.gt.${new Date().toISOString()}`)
        .eq("customers.phone", phone);
      if (error) fail("open order count", error);
      return count ?? 0;
    },

    async setQrImageUrl(holderId, url) {
      const { error } = await sb.from("ticket_holders").update({ qr_image_url: url }).eq("id", holderId);
      if (error) fail("qr image update", error);
    },

    async getPaymentOrder(ref) {
      const { data, error } = await sb
        .from("orders")
        .select("id, booking_reference, total_amount, payment_status, return_origin")
        .eq("booking_reference", ref)
        .maybeSingle();
      if (error) fail("order lookup", error);
      return (data as PaymentOrder | null) ?? null;
    },

    async getOrderContext(ref) {
      const { data, error } = await sb
        .from("orders")
        .select("*, customers(*), events(*), ticket_holders(*)")
        .eq("booking_reference", ref)
        .maybeSingle();
      if (error) fail("order context", error);
      if (!data) return null;
      const { customers, events, ticket_holders, ...order } = data as Row;
      const { data: tickets, error: ticketError } = await sb
        .from("tickets")
        .select("type, price")
        .eq("event_id", order.event_id);
      if (ticketError) fail("ticket prices", ticketError);
      const prices: Record<string, number> = {};
      for (const t of (tickets ?? []) as { type: string; price: number }[]) prices[t.type] = Number(t.price);
      const holders = [...((ticket_holders as Row[] | null) ?? [])].sort((a, b) =>
        String(a.qr_code).localeCompare(String(b.qr_code)),
      );
      return {
        order: order as OrderContext["order"],
        customer: (customers as Row) ?? {},
        event: (events as Row) ?? {},
        holders,
        prices,
      };
    },

    async confirmOrderPayment(ref, transactionNumber) {
      const { data, error } = await sb.rpc("confirm_order_payment", {
        p_booking_reference: ref,
        p_transaction_number: transactionNumber,
      });
      if (error) fail("confirm payment", error);
      return data as { result: string };
    },

    async failOrderPayment(ref, note) {
      const { data, error } = await sb.rpc("mark_order_payment_failed", { p_booking_reference: ref, p_note: note });
      if (error) fail("fail payment", error);
      return data as { result: string };
    },

    async claimPaymentCheck(ref) {
      const { data, error } = await sb.rpc("claim_payment_check", { p_booking_reference: ref });
      if (error) fail("claim payment check", error);
      return (data as { order_id: string } | null) ?? null;
    },

    async logPaymentEvent(event) {
      const { error } = await sb.from("payment_events").insert(event);
      if (error) fail("payment event", error);
    },

    async checkInTicket(code, adminId) {
      const { data, error } = await sb.rpc("check_in_ticket", { p_code: code, p_admin: adminId });
      if (error) fail("check in", error);
      return data as CheckInResult;
    },

    async listHoldersMissingQrImage(limit) {
      const { data, error } = await sb
        .from("ticket_holders")
        .select("id, qr_code")
        .is("qr_image_url", null)
        .not("qr_code", "is", null)
        .limit(limit);
      if (error) fail("list holders", error);
      return (data ?? []) as { id: string; qr_code: string }[];
    },

    async listBookingHolders(ref) {
      const { data: order, error } = await sb.from("orders").select("id").eq("booking_reference", ref).maybeSingle();
      if (error) fail("order lookup", error);
      if (!order) return null;
      const { data, error: holdersError } = await sb
        .from("ticket_holders")
        .select("id, qr_code")
        .eq("order_id", (order as { id: string }).id)
        .order("qr_code");
      if (holdersError) fail("list booking holders", holdersError);
      return (data ?? []) as { id: string; qr_code: string }[];
    },
  };
}

export function createQrStorage(sb: SupabaseLike): QrStorage {
  return {
    async uploadPng(objectName, png) {
      const bucket = sb.storage.from(BUCKET);
      const { error } = await bucket.upload(objectName, png, { contentType: "image/png", upsert: true });
      if (error) fail("qr upload", error);
      return bucket.getPublicUrl(objectName).data.publicUrl as string;
    },
  };
}

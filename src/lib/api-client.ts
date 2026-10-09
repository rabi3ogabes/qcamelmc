// Typed gateway to the backend (edge functions + database functions).
// Pure: the Supabase client is injected, so it is testable without a network.
// Every call resolves to { ok, data | error } and never throws.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface ApiError {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
}
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export type PaymentMethod = "sadad" | "cash_pos";

export interface OrderCustomerInput {
  name: string;
  email: string;
  phone: string;
  country_code: string;
  nationality: string;
  id_number: string;
}
export interface OrderHolderInput {
  ticket_id: string;
  name: string;
  phone: string;
  nationality: string;
  id_number: string;
}
export interface OrderInput {
  customer: OrderCustomerInput;
  items: { ticket_id: string; quantity: number }[];
  holders: OrderHolderInput[];
  payment_method: PaymentMethod;
  /** Only honoured for signed-in administrators (point of sale). */
  source?: "pos";
}

/** Hidden fields to POST to Sadad's hosted checkout. */
export interface SadadPayment {
  url: string;
  fields: Record<string, string>;
}

export interface CreatedOrder {
  success: true;
  order: {
    id: string;
    booking_reference: string;
    total_amount: number;
    payment_method: PaymentMethod;
    payment_status: string;
    payment_expires_at: string | null;
  };
  payment?: SadadPayment;
}

export interface OrderStatus {
  booking_reference: string;
  payment_status: "pending" | "confirmed" | "cancelled" | "failed";
  payment_method: PaymentMethod;
  total_amount: number;
  quantity: number;
  ticket_type: string;
  created_at: string;
  payment_expires_at: string | null;
  event_id: string;
  event: { title: string; event_date: string; location: string };
  tickets: { ticket_type: string; name: string; qr_code: string; qr_image_url: string | null }[];
}

export interface VerifyResult {
  success: true;
  checked: boolean;
  payment_status: OrderStatus["payment_status"];
}

export interface CheckinResponse {
  success: boolean;
  message?: string;
  ticket_info?: Record<string, unknown>;
}

export interface DiagnoseCheck {
  id: string;
  status: "ok" | "warn" | "error";
  message: string;
}
export interface DiagnoseReport {
  success: true;
  ready: boolean;
  environment: "live" | "sandbox" | null;
  callbackUrl: string;
  webhookUrl: string;
  checks: DiagnoseCheck[];
}

type Client = Pick<SupabaseClient<Database>, "functions" | "rpc">;

async function toApiError(error: unknown): Promise<ApiError> {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "Request failed");
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as Record<string, unknown>;
      return {
        code: typeof body.code === "string" ? body.code : "request_failed",
        message: typeof body.error === "string" ? body.error : message,
        status: context.status,
        details: body,
      };
    } catch {
      return { code: "request_failed", message, status: context.status };
    }
  }
  return { code: "network_error", message };
}

export function createApi(client: Client) {
  async function invoke<T>(name: string, body: unknown): Promise<ApiResult<T>> {
    try {
      const { data, error } = await client.functions.invoke(name, { body: body as Record<string, unknown> });
      if (error) return { ok: false, error: await toApiError(error) };
      return { ok: true, data: data as T };
    } catch (error) {
      return { ok: false, error: { code: "network_error", message: error instanceof Error ? error.message : "Request failed" } };
    }
  }

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<ApiResult<T>> {
    try {
      // rpc() is generic over the generated function names; this gateway is name-agnostic
      const call = client.rpc as unknown as (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      const { data, error } = await call.call(client, fn, args);
      if (error) {
        return { ok: false, error: { code: error.message === "forbidden" ? "forbidden" : "rpc_failed", message: error.message } };
      }
      return { ok: true, data: data as T };
    } catch (error) {
      return { ok: false, error: { code: "network_error", message: error instanceof Error ? error.message : "Request failed" } };
    }
  }

  return {
    /** Create a booking. Prices, stock and status are decided by the server. */
    createOrder: (input: OrderInput) => invoke<CreatedOrder>("create-order", input),

    /** Fresh Sadad checkout fields for an order that is still waiting for payment. */
    restartPayment: (bookingReference: string) =>
      invoke<{ success: true; payment: SadadPayment }>("sadad-payment", { booking_reference: bookingReference }),

    /** Ask the server to check the payment with Sadad (throttled; admins unthrottled). */
    verifyPayment: (bookingReference: string) =>
      invoke<VerifyResult>("verify-payment", { booking_reference: bookingReference }),

    /** Look orders up by their (unguessable) booking references. */
    async getOrderStatuses(refs: string[]): Promise<ApiResult<OrderStatus[]>> {
      if (refs.length === 0) return { ok: true, data: [] };
      return rpc<OrderStatus[]>("get_order_status", { p_refs: refs });
    },

    /** Gate: admit a ticket. The server decides (exists? paid? already used?) atomically. */
    checkInTicket: (code: string) => invoke<CheckinResponse>("ticket-checkin", { booking_reference: code }),

    /** Admin: cancel an order and put its seats back on sale. */
    cancelOrder: (orderId: string, note?: string) =>
      rpc<{ result: "cancelled" | "already_inactive" | "order_not_found" }>("cancel_order", { p_order_id: orderId, p_note: note }),

    /** Admin: recompute sold counters from the orders themselves. */
    recountStock: () => rpc<number>("recount_ticket_stock", {}),

    /** Admin: readiness report for the Sadad setup. */
    diagnoseSadad: () => invoke<DiagnoseReport>("sadad-diagnose", {}),
  };
}

export type Api = ReturnType<typeof createApi>;

// ---------------------------------------------------------------------------
// User-facing messages
// ---------------------------------------------------------------------------

type Translate = (key: string, options?: { defaultValue?: string }) => string;

const TICKET_LABELS: Record<string, string> = { vip: "VIP", normal: "الدخول العام", parking: "المواقف" };

const MESSAGES: Record<string, string> = {
  insufficient_stock: "عذراً، لم تعد هناك تذاكر كافية من هذا النوع. يرجى تقليل الكمية أو اختيار نوع آخر.",
  quantity_limit_exceeded: "تجاوزت الحد الأقصى للتذاكر في الطلب الواحد.",
  below_minimum_amount: "الحد الأدنى للدفع عبر سداد هو 3 ريال قطري.",
  event_not_available: "هذه الفعالية غير متاحة للحجز حالياً.",
  too_many_pending_orders: "لديك حجوزات غير مكتملة. يرجى إتمامها أو المحاولة لاحقاً.",
  payment_unavailable: "الدفع الإلكتروني غير متاح حالياً. يمكنك اختيار الدفع عند الحضور.",
  validation_failed: "يرجى التحقق من البيانات المُدخلة والمحاولة مرة أخرى.",
  invalid_tickets: "إحدى التذاكر المختارة لم تعد متاحة. يرجى العودة واختيار التذاكر من جديد.",
  holders_mismatch: "يرجى إدخال بيانات حامل كل تذكرة.",
  unauthorized: "انتهت الجلسة. يرجى تسجيل الدخول من جديد.",
  forbidden: "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
  network_error: "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.",
};

const GENERIC = "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.";

/** A friendly Arabic message for an API error. Server internals are never shown. */
export function apiErrorMessage(error: ApiError, t: Translate): string {
  let text = t(`apiError_${error.code}`, { defaultValue: MESSAGES[error.code] ?? GENERIC });
  const type = error.details?.ticket_type;
  if (error.code === "insufficient_stock" && typeof type === "string" && TICKET_LABELS[type]) {
    text = `${text} (${TICKET_LABELS[type]})`;
  }
  return text;
}

import { supabase } from "@/integrations/supabase/client";

export type PaymentErrorSource = "sadad" | "bank" | "site";

const BANK_HINTS = [
  "card", "بطاقة", "declin", "مرفوض", "insufficient", "رصيد", "bank", "بنك",
  "expired card", "منتهية", "cvv", "3d", "authorization", "تفويض", "issuer",
];

const SADAD_HINTS = ["sadad", "سداد", "merchant", "checksum", "gateway", "بوابة"];

export const classifyPaymentError = (
  message?: string | null,
  code?: string | null,
): PaymentErrorSource => {
  const text = `${message ?? ""} ${code ?? ""}`.toLowerCase();
  if (BANK_HINTS.some((h) => text.includes(h))) return "bank";
  if (SADAD_HINTS.some((h) => text.includes(h))) return "sadad";
  return "site";
};

export const paymentErrorSourceLabel = (source: string): string => {
  switch (source) {
    case "sadad":
      return "سداد";
    case "bank":
      return "البنك / البطاقة";
    default:
      return "الموقع";
  }
};

export interface LogPaymentErrorParams {
  orderId?: string | null;
  bookingReference?: string | null;
  eventId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  quantity?: number | null;
  amount?: number | null;
  paymentId?: string | null;
  errorSource?: PaymentErrorSource;
  errorCode?: string | null;
  errorMessage?: string | null;
  raw?: Record<string, unknown>;
}

/** Records a failed payment attempt. Never throws — logging must not break checkout. */
export const logPaymentError = async (params: LogPaymentErrorParams): Promise<void> => {
  try {
    const source =
      params.errorSource ?? classifyPaymentError(params.errorMessage, params.errorCode);

    const cut = (v: string | null | undefined, max: number) => (v ? v.slice(0, max) : null);
    let raw: Record<string, unknown> = {
      ...(params.raw ?? {}),
      url: typeof window !== "undefined" ? window.location.href.slice(0, 500) : null,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    };
    if (JSON.stringify(raw).length > 8000) raw = { truncated: true, preview: JSON.stringify(raw).slice(0, 8000) };

    const { error } = await supabase.from("payment_errors").insert({
      order_id: params.orderId ?? null,
      booking_reference: cut(params.bookingReference, 100),
      event_id: params.eventId ?? null,
      customer_name: cut(params.customerName, 200),
      customer_phone: cut(params.customerPhone, 50),
      quantity: params.quantity ?? null,
      amount: params.amount ?? null,
      payment_id: cut(params.paymentId, 200),
      error_source: source,
      error_code: cut(params.errorCode, 200),
      error_message: cut(params.errorMessage, 2000),
      raw: raw as never,
    });
    if (error) console.error("Failed to log payment error:", error.message);
  } catch (error) {
    console.error("Failed to log payment error:", error);
  }
};

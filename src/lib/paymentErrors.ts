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

    await supabase.from("payment_errors").insert({
      order_id: params.orderId ?? null,
      booking_reference: params.bookingReference ?? null,
      event_id: params.eventId ?? null,
      customer_name: params.customerName ?? null,
      customer_phone: params.customerPhone ?? null,
      quantity: params.quantity ?? null,
      amount: params.amount ?? null,
      payment_id: params.paymentId ?? null,
      error_source: source,
      error_code: params.errorCode ?? null,
      error_message: params.errorMessage ?? null,
      raw: {
        ...(params.raw ?? {}),
        url: typeof window !== "undefined" ? window.location.href : null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      },
    });
  } catch (error) {
    console.error("Failed to log payment error:", error);
  }
};

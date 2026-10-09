import { useCallback, useEffect, useRef, useState } from "react";
import { api as defaultApi, type ApiResult, type OrderStatus, type VerifyResult } from "@/lib/api";

export type PaymentPhase = "checking" | "confirmed" | "failed" | "delayed" | "not_found" | "cash";

export interface PaymentStatusApi {
  getOrderStatuses(refs: string[]): Promise<ApiResult<OrderStatus[]>>;
  verifyPayment(ref: string): Promise<ApiResult<VerifyResult>>;
}

export interface PaymentStatusOptions {
  api?: PaymentStatusApi;
  /** How often the order is re-read. */
  pollMs?: number;
  /** Minimum gap between asking the server to verify with Sadad. */
  verifyMs?: number;
  /** After this long the page stops waiting and offers "check again". */
  timeoutMs?: number;
}

/**
 * What happened to a booking's payment? The browser never decides: it only
 * reads the order's server-side status and nudges the server to verify the
 * payment with Sadad (which is what actually confirms it).
 */
export function usePaymentStatus(reference: string | null, options: PaymentStatusOptions = {}) {
  const { api = defaultApi, pollMs = 3000, verifyMs = 12_000, timeoutMs = 120_000 } = options;
  const [phase, setPhase] = useState<PaymentPhase>(reference ? "checking" : "not_found");
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [round, setRound] = useState(0);
  // a new api object from the caller must not restart polling
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    if (!reference) {
      setPhase("not_found");
      return;
    }
    setPhase("checking");

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    let lastVerify = -Infinity;
    let verifiedWhileFailed = false;

    /** undefined = temporary error, null = no such booking */
    const read = async (): Promise<OrderStatus | null | undefined> => {
      const result = await apiRef.current.getOrderStatuses([reference]);
      return result.ok ? (result.data[0] ?? null) : undefined;
    };

    const scheduleNext = () => {
      timer = setTimeout(tick, pollMs);
    };

    const tick = async () => {
      if (cancelled) return;
      let current = await read();
      if (cancelled) return;
      if (current === undefined) return scheduleNext(); // network blip: keep trying
      if (current === null) return setPhase("not_found");
      setOrder(current);

      // An online order that is waiting (or that expired while the customer was paying)
      // may have been paid: ask the server to check with Sadad, at most every verifyMs.
      const mayBePaid = current.payment_status === "pending" || (current.payment_status === "failed" && !verifiedWhileFailed);
      if (current.payment_method === "sadad" && mayBePaid && Date.now() - lastVerify >= verifyMs) {
        lastVerify = Date.now();
        if (current.payment_status === "failed") verifiedWhileFailed = true;
        await apiRef.current.verifyPayment(reference);
        if (cancelled) return;
        const after = await read();
        if (cancelled) return;
        if (after) {
          current = after;
          setOrder(after);
        }
      }

      if (current.payment_status === "confirmed") return setPhase("confirmed");
      if (current.payment_status === "failed" || current.payment_status === "cancelled") return setPhase("failed");
      if (current.payment_method === "cash_pos") return setPhase("cash");
      if (Date.now() - startedAt >= timeoutMs) return setPhase("delayed");
      scheduleNext();
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reference, pollMs, verifyMs, timeoutMs, round]);

  const checkAgain = useCallback(() => setRound((r) => r + 1), []);

  return { phase, order, checkAgain };
}

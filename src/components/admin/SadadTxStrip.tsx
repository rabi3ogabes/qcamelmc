import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface SadadTxSummary {
  found: boolean;
  reason?: string;
  transaction?: {
    status: string;
    statusAr: string;
    mode: string | null;
    modeAr: string | null;
    amount: number;
    commission: number;
    refundCharge: number;
    netAmount: number;
    isRefund: boolean;
  };
}

/** Loads Sadad transaction details for every Sadad order on the current page (one call). */
export function useSadadTransactions(orders: { id: string; payment_method: string }[]) {
  const ids = useMemo(
    () => orders.filter((o) => o.payment_method === "sadad").map((o) => o.id).slice(0, 50),
    [orders],
  );
  const key = ids.join(",");
  const [data, setData] = useState<Record<string, SadadTxSummary>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ids.length) return;
    let cancelled = false;
    setLoading(true);
    supabase.functions
      .invoke<{ success?: boolean; results?: Record<string, SadadTxSummary> }>("sadad-transaction", {
        body: { orderIds: ids },
      })
      .then(({ data: res }) => {
        if (!cancelled && res?.results) setData((prev) => ({ ...prev, ...res.results }));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading };
}

const tone = (status: string) => {
  switch (status) {
    case "SUCCESS":
      return "bg-primary/15 text-primary border-primary/30";
    case "FAILED":
    case "REJECTED":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "REFUND":
    case "REFUNDED":
    case "ONHOLD":
      return "bg-secondary text-secondary-foreground border-border";
    default:
      return "bg-accent text-accent-foreground border-border";
  }
};

const qar = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(2)} ر.ق`;

export function SadadTxStrip({ summary, loading }: { summary?: SadadTxSummary; loading: boolean }) {
  if (!summary) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground font-lusail flex items-center gap-2">
        {loading ? <><Loader2 className="w-3 h-3 animate-spin" /> جارٍ جلب حالة العملية من سداد…</> : "حالة سداد غير متاحة"}
      </div>
    );
  }
  if (!summary.found || !summary.transaction) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground font-lusail">
        {summary.reason === "not_found" ? "لا توجد عملية لدى سداد لهذا الطلب" : "تعذر الاتصال بسداد الآن"}
      </div>
    );
  }
  const tx = summary.transaction;
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2 space-y-1.5 font-lusail">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 ${tone(tx.status)}`}>
          {tx.statusAr}
        </span>
        {tx.modeAr && <span className="text-[11px] text-muted-foreground">{tx.modeAr}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground">مبلغ العملية</p>
          <p className="text-xs font-bold">{qar(tx.amount)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">رسوم سداد</p>
          <p className="text-xs font-bold text-destructive">{qar(tx.commission + tx.refundCharge)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">الصافي</p>
          <p className="text-xs font-bold text-primary">{qar(tx.netAmount)}</p>
        </div>
      </div>
    </div>
  );
}

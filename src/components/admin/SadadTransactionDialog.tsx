import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertCircle, ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface SadadTransaction {
  transactionno: string;
  status: string;
  statusAr: string;
  isRefund: boolean;
  amount: number;
  commission: number;
  refundCharge: number;
  netAmount: number;
  mode: string | null;
  entity: string | null;
  transactiondate: string | null;
  websiteRefNo: string | null;
}

const statusStyle = (status: string) => {
  switch (status.toUpperCase()) {
    case "SUCCESS":
      return "bg-emerald-600 text-white border-emerald-600";
    case "FAILED":
    case "REJECTED":
      return "bg-destructive text-destructive-foreground border-destructive";
    case "REFUND":
    case "REFUNDED":
      return "bg-sky-600 text-white border-sky-600";
    case "PENDING":
    case "INPROGRESS":
    case "IN PROGRESS":
      return "bg-amber-500 text-white border-amber-500";
    case "ONHOLD":
    case "ON HOLD":
      return "bg-slate-500 text-white border-slate-500";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const Row = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
  <div className="flex items-center justify-between gap-4 rounded-lg border bg-card/50 px-4 py-3">
    <span className="text-xs text-muted-foreground font-lusail">{label}</span>
    <span className={`text-sm font-semibold font-mono ${accent ?? ""}`}>{value}</span>
  </div>
);

interface Props {
  orderId: string | null;
  bookingReference?: string;
  onOpenChange: (open: boolean) => void;
}

export const SadadTransactionDialog = ({ orderId, bookingReference, onOpenChange }: Props) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<SadadTransaction | null>(null);

  const load = async (id: string) => {
    setLoading(true);
    setError(null);
    setTx(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("sadad-transaction", {
        body: { orderId: id },
      });
      if (fnError) {
        // Extract the real message returned by the edge function body
        let message = "";
        const ctx = (fnError as any)?.context;
        try {
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            message = body?.error || "";
          } else if (typeof ctx?.body === "string") {
            message = JSON.parse(ctx.body)?.error || "";
          }
        } catch {
          /* ignore parse errors */
        }
        throw new Error(message || "تعذر الاتصال بسداد. حاول مرة أخرى لاحقاً.");
      }
      if (data?.error) throw new Error(data.error);
      setTx(data.transaction as SadadTransaction);
    } catch (e) {
      setError((e as Error).message || "تعذر جلب تفاصيل العملية من سداد");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (orderId) load(orderId);
  }, [orderId]);

  const qar = (n: number) => `${n.toFixed(2)} ر.ق`;

  return (
    <Dialog open={!!orderId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-lusail flex items-center gap-2">
            <ReceiptText className="w-5 h-5 text-primary" />
            تفاصيل عملية سداد
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="sr-only">تفاصيل عملية الدفع عبر سداد</DialogDescription>


        {bookingReference && (
          <p className="text-xs text-muted-foreground font-mono">{bookingReference}</p>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground font-lusail">جارٍ الاتصال بسداد…</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
            <p className="text-sm text-destructive font-lusail">{error}</p>
          </div>
        )}

        {!loading && tx && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border bg-gradient-to-l from-primary/10 to-transparent px-4 py-4">
              <div>
                <p className="text-xs text-muted-foreground font-lusail mb-1">حالة العملية</p>
                <Badge className={`font-lusail text-sm px-3 py-1 ${statusStyle(tx.status)}`}>
                  {tx.statusAr}
                </Badge>
              </div>
              <div className="text-left">
                <p className="text-xs text-muted-foreground font-lusail mb-1">المبلغ</p>
                <p className="text-2xl font-bold text-primary">{qar(tx.amount)}</p>
              </div>
            </div>

            <Row label="رقم العملية" value={tx.transactionno} />
            <Row label="عمولة سداد" value={`- ${qar(tx.commission)}`} accent="text-amber-600" />
            {tx.refundCharge > 0 && (
              <Row label="رسوم الاسترداد" value={`- ${qar(tx.refundCharge)}`} accent="text-sky-600" />
            )}
            <Row label="الصافي بعد العمولة" value={qar(tx.netAmount)} accent="text-emerald-600" />
            {tx.mode && <Row label="وسيلة الدفع" value={tx.mode} />}
            {tx.transactiondate && <Row label="تاريخ العملية" value={tx.transactiondate} />}
            {tx.isRefund && (
              <p className="text-xs text-sky-600 font-lusail">تمت عملية استرداد على هذه المعاملة.</p>
            )}
          </div>
        )}

        {!loading && orderId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(orderId)}
            className="font-lusail gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            تحديث من سداد
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
};

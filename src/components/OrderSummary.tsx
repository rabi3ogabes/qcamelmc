import { Check, Copy } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { OrderStatus } from "@/lib/api";


function formatDate(value: string): string {
  try {
    return format(new Date(value), "EEEE، d MMMM yyyy", { locale: ar });
  } catch {
    return value;
  }
}

const STATUS_STYLE: Record<OrderStatus["payment_status"], { key: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  confirmed: { key: "statusConfirmed", variant: "default" },
  pending: { key: "statusPending", variant: "secondary" },
  failed: { key: "statusFailed", variant: "destructive" },
  cancelled: { key: "statusCancelled", variant: "destructive" },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="font-semibold">{children}</div>
    </div>
  );
}

/** Booking details: reference, event, quantity, amount, payment and status. */
export function OrderSummary({ order }: { order: OrderStatus }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const status = STATUS_STYLE[order.payment_status] ?? STATUS_STYLE.pending;

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(order.booking_reference);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable: the reference is still visible and selectable */
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/40 p-4 text-center">
        <p className="mb-1 text-sm text-muted-foreground">{t("bookingReference")}</p>
        <div className="flex items-center justify-center gap-2">
          <span className="select-all font-mono text-xl font-bold tracking-wider" dir="ltr">
            {order.booking_reference}
          </span>
          <Button variant="ghost" size="icon" onClick={copyReference} aria-label={t("copyReference")}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Row label={t("eventTitle")}>{order.event.title}</Row>
        <Row label={t("eventDate")}>{formatDate(order.event.event_date)}</Row>
        <Row label={t("eventLocation")}>{order.event.location}</Row>
        <Row label={t("quantity")}>{order.quantity}</Row>
        <Row label={t("amount")}>
          {Number(order.total_amount).toFixed(2)} {t("qar")}
        </Row>
        <Row label={t("paymentMethod")}>
          {order.payment_method === "sadad" ? t("paymentMethodSadad") : t("paymentMethodCash")}
        </Row>
        <Row label={t("status")}>
          <Badge variant={status.variant}>{t(status.key)}</Badge>
        </Row>
      </div>
    </div>
  );
}

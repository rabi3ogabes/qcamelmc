import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Clock, Loader2, SearchX, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/Footer";
import { OrderSummary } from "@/components/OrderSummary";
import { useSettings } from "@/contexts/SettingsContext";
import { usePaymentStatus, type PaymentPhase } from "@/hooks/usePaymentStatus";
import { api, apiErrorMessage } from "@/lib/api";
import { recallOrders, redirectToSadad, rememberOrder } from "@/lib/payment";

const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;

/** The reference comes back in the URL; the browser's own memory is the fallback. */
function pickReference(params: URLSearchParams): string | null {
  for (const key of ["ref", "ORDERID", "order"]) {
    const value = params.get(key)?.trim();
    if (value && REFERENCE.test(value)) return value;
  }
  return recallOrders().at(-1) ?? null;
}

const HEADLINES: Record<Exclude<PaymentPhase, "cash">, { icon: typeof Clock; tone: string; title: string; desc: string }> = {
  checking: { icon: Loader2, tone: "text-primary", title: "paymentChecking", desc: "paymentCheckingDesc" },
  confirmed: { icon: CheckCircle2, tone: "text-green-600", title: "paymentSuccessTitle", desc: "paymentSuccessDesc" },
  failed: { icon: XCircle, tone: "text-destructive", title: "paymentFailedTitle", desc: "paymentFailedDesc" },
  delayed: { icon: Clock, tone: "text-amber-600", title: "paymentDelayedTitle", desc: "paymentDelayedDesc" },
  not_found: { icon: SearchX, tone: "text-muted-foreground", title: "paymentNotFoundTitle", desc: "paymentNotFoundDesc" },
};

const PaymentResult = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [params] = useSearchParams();
  const reference = useMemo(() => pickReference(params), [params]);
  const { phase, order, checkAgain } = usePaymentStatus(reference);
  const [reopening, setReopening] = useState(false);

  // The booking is complete: nothing left to resume on the checkout page, and the confirmation
  // page (invoice, tickets, QR codes) takes over. It finds the booking by its remembered reference.
  useEffect(() => {
    if (phase === "confirmed") {
      if (reference) rememberOrder(reference);
      try {
        localStorage.removeItem("ticketSelection");
      } catch {
        /* ignore */
      }
    }
  }, [phase, reference]);

  if (phase === "cash" || phase === "confirmed") return <Navigate to="/confirmation" replace />;

  const reopenPayment = async () => {
    if (!reference) return;
    setReopening(true);
    const result = await api.restartPayment(reference);
    if (result.ok === true) {
      redirectToSadad(result.data.payment);
      return;
    }
    setReopening(false);
    toast.error(apiErrorMessage(result.error, t));
  };

  const headline = HEADLINES[phase];
  const Icon = headline.icon;
  const canResume = (phase === "delayed" || phase === "failed") && order?.payment_method === "sadad" && order.payment_status === "pending";
  const eventLink = order ? `/tickets/${order.event_id}` : "/";

  return (
    <div className="min-h-screen bg-background font-lusail">
      <header className="border-b backdrop-blur-sm" style={{ backgroundColor: settings?.header_bg_color }}>
        <div className="container mx-auto flex items-center justify-center px-4 py-4">
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="Logo" className="h-12 cursor-pointer object-contain" onClick={() => navigate("/")} />
          ) : (
            <h1 className="cursor-pointer text-2xl font-bold" onClick={() => navigate("/")}>
              فعاليات قطر
            </h1>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <div className="mb-8 text-center" role="status" aria-live="polite">
          <div className={`mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-muted ${headline.tone}`}>
            <Icon className={`h-10 w-10 ${phase === "checking" ? "animate-spin" : ""}`} />
          </div>
          <h1 className="mb-3 text-3xl font-bold sm:text-4xl">{t(headline.title)}</h1>
          <p className="mx-auto max-w-xl text-muted-foreground">{t(headline.desc)}</p>
        </div>

        {order && phase !== "not_found" && (
          <Card className="mb-6 space-y-8 p-6 sm:p-8">
            <OrderSummary order={order} />
          </Card>
        )}

        {phase === "delayed" && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{t("paymentDelayedDesc")}</p>
          </div>
        )}

        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row">
          {phase === "delayed" && (
            <Button size="lg" onClick={checkAgain}>
              {t("checkAgain")}
            </Button>
          )}
          {canResume && (
            <Button size="lg" variant="outline" onClick={reopenPayment} disabled={reopening}>
              {reopening && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              {t("reopenPayment")}
            </Button>
          )}
          {(phase === "failed" || phase === "not_found") && (
            <Button size="lg" onClick={() => navigate(eventLink)}>
              {t("newBooking")}
            </Button>
          )}
          <Button size="lg" variant="outline" onClick={() => navigate("/")}>
            {t("returnToHome")}
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PaymentResult;

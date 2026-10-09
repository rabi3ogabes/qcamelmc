import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/Footer";
import { OrderSummary, TicketList } from "@/components/OrderSummary";
import { useSettings } from "@/contexts/SettingsContext";
import { api, type OrderStatus } from "@/lib/api";
import { recallOrders } from "@/lib/payment";

/** Booking received (cash at venue): reference, details and the tickets' QR codes. */
const Confirmation = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [orders, setOrders] = useState<OrderStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refs = recallOrders();
    if (refs.length === 0) {
      navigate("/", { replace: true });
      return;
    }
    api.getOrderStatuses(refs).then((result) => {
      if (result.ok && result.data.length > 0) setOrders(result.data);
      else navigate("/", { replace: true });
      setLoading(false);
    });
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center font-lusail">
        <div className="animate-pulse text-lg">{t("loading")}</div>
      </div>
    );
  }

  const allPaid = orders.every((o) => o.payment_status === "confirmed");

  return (
    <div className="min-h-screen bg-background px-4 py-12 font-lusail">
      <div className="mx-auto max-w-3xl">
        {settings?.logo_url && (
          <div className="mb-8 flex justify-center">
            <img src={settings.logo_url} alt="Logo" className="h-16 object-contain" />
          </div>
        )}

        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-secondary/20">
            {allPaid ? <CheckCircle className="h-8 w-8 text-secondary" /> : <Clock className="h-8 w-8 text-secondary" />}
          </div>
          <h1 className="mb-4 text-4xl font-bold">{allPaid ? t("paymentSuccessTitle") : t("cashBookingTitle")}</h1>
          <p className="text-lg text-muted-foreground">{allPaid ? t("paymentSuccessDesc") : t("cashBookingDesc")}</p>
        </div>

        {orders.map((order) => (
          <Card key={order.booking_reference} className="mb-6 space-y-8 p-6 sm:p-8">
            <OrderSummary order={order} />
            {order.payment_status !== "failed" && order.payment_status !== "cancelled" && <TicketList tickets={order.tickets} />}
          </Card>
        ))}

        <Card className="mb-8 p-6">
          <h4 className="mb-2 font-semibold">{t("nextSteps")}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {["saveReference", "presentQR"].map((key) => (
              <li key={key} className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="text-center">
          <Button size="lg" onClick={() => navigate("/")}>
            {t("returnToHome")}
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Confirmation;

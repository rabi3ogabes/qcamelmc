import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock } from "lucide-react";
import { Footer } from "@/components/Footer";
import { InvoiceCard } from "@/components/InvoiceCard";
import type { InvoiceData } from "@/lib/generateInvoicePdf";

interface Order {
  id: string;
  booking_reference: string;
  payment_status: string;
  payment_method: string;
  payment_id: string | null;
  confirmed_at: string | null;
  ticket_type: string;
  quantity: number;
  total_amount: number;
  customers: { name: string; phone: string; country_code: string | null; nationality: string | null } | null;
  events: { title: string; event_date: string } | null;
  ticket_holders:
    | {
        qr_code: string | null;
        ticket_type: string;
        is_present?: boolean | null;
        confirmed_at?: string | null;
        confirmed_by_name?: string | null;
      }[]
    | null;
}

const Confirmation = () => {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("public_settings")
      .select("logo_url")
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    if (data?.logo_url) {
      setLogoUrl(data.logo_url);
    }
  };

  const fetchOrders = async () => {
    try {
      const orderIds: string[] = JSON.parse(localStorage.getItem("orderIds") || "[]");

      if (orderIds.length === 0) {
        navigate("/");
        return;
      }

      const results = await Promise.all(
        orderIds.map((id) => supabase.rpc("get_public_order", { p_order_id: id }))
      );

      const loaded = results
        .map((r) => r.data as unknown as Order | null)
        .filter(Boolean) as Order[];

      setOrders(loaded);
      localStorage.removeItem("orderIds");

      // Email the invoice to the customer (fire-and-forget, deduped server-side)
      loaded
        .filter((o) => o.payment_status === "confirmed")
        .forEach((o) => {
          supabase.functions
            .invoke("send-invoice-email", { body: { order_id: o.id } })
            .catch((e) => console.error("Invoice email failed:", e));
        });

    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };


  const toInvoiceData = (order: Order): InvoiceData => {
    const holders = (order.ticket_holders || []).filter((h) => h.qr_code);
    return {
      booking_reference: order.booking_reference,
      customer_name: order.customers?.name || "-",
      customer_phone: `${order.customers?.country_code || ""}${order.customers?.phone || ""}`,
      nationality: order.customers?.nationality || null,
      ticket_type: order.ticket_type,
      quantity: order.quantity,
      total_amount: order.total_amount,
      payment_status: order.payment_status,
      event_title: order.events?.title || "-",
      event_date: order.events?.event_date || "",
      qr_codes: holders.map((h) => h.qr_code) as string[],
      ticket_types: holders.map((h) => h.ticket_type),
      ticket_states: holders,
      logo_url: logoUrl,
      payment_id: order.payment_id,
      payment_method: order.payment_method,
      paid_at: order.confirmed_at,
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-lusail">
        <div className="animate-pulse text-lg">{t("loading")}</div>
      </div>
    );
  }

  const isConfirmed = orders.some((order) => order.payment_status === "confirmed");

  return (
    <div className="min-h-screen bg-background py-8 sm:py-12 px-4 sm:px-6 font-lusail">
      <div className="max-w-3xl mx-auto w-full">
        {logoUrl && (
          <div className="flex justify-center mb-8">
            <img src={logoUrl} alt="Logo" className="h-16 object-contain" />
          </div>
        )}
        <div className="text-center mb-8">
          <div
            className={`inline-flex items-center justify-center w-16 h-16 ${
              isConfirmed ? "bg-green-500/20" : "bg-secondary/20"
            } rounded-full mb-4`}
          >
            {isConfirmed ? (
              <CheckCircle className="w-8 h-8 text-green-500" />
            ) : (
              <Clock className="w-8 h-8 text-secondary" />
            )}
          </div>
          <h1 className="text-4xl font-bold mb-4">
            {isConfirmed ? t("bookingConfirmed") || "تم تأكيد الحجز!" : t("bookingReceived")}
          </h1>
          <p className="text-lg text-muted-foreground">
            {isConfirmed
              ? "تم تأكيد دفعتك بنجاح. يمكنك تحميل الفاتورة الآن."
              : t("bookingPending")}
          </p>
        </div>

        {isConfirmed ? (
          <div className="space-y-8 mb-8">
            {orders
              .filter((o) => o.payment_status === "confirmed")
              .map((order) => (
                <InvoiceCard key={order.id} data={toInvoiceData(order)} />
              ))}
          </div>
        ) : (
          <Card className="p-8 mb-8">
            <div className="space-y-6">
              <div className="bg-accent/50 p-6 rounded-lg border-l-4 border-secondary">
                <h3 className="font-semibold text-lg mb-2">{t("paymentPendingTitle")}</h3>
                <p className="text-muted-foreground">{t("paymentPendingDesc")}</p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-4">{t("bookingDetails")}</h3>
                {orders.map((order) => (
                  <div key={order.id} className="mb-4 pb-4 border-b last:border-b-0">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("bookingReference")}</p>
                        <p className="font-mono font-semibold text-lg">{order.booking_reference}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t("ticketType")}</p>
                        <p className="font-semibold capitalize">{order.ticket_type}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t("quantity")}</p>
                        <p className="font-semibold">{order.quantity}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t("amount")}</p>
                        <p className="font-semibold">
                          {order.total_amount.toFixed(2)} {t("qar")}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t("paymentMethod")}</p>
                        <p className="font-semibold capitalize">
                          {order.payment_method === "sadad" ? t("sadadOnline") : t("cashAtVenue")}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t("status")}</p>
                        <p className="font-semibold text-secondary capitalize">{order.payment_status}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-semibold mb-2">{t("nextSteps")}</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                    <span>{t("saveReference")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                    <span>{t("adminReview")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                    <span>{t("receiveEmail")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                    <span>{t("presentQR")}</span>
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        )}

        <div className="text-center">
          <Button size="lg" variant="secondary" onClick={() => navigate("/")}>
            {t("returnToHome")}
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Confirmation;

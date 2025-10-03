import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock } from "lucide-react";

interface Order {
  id: string;
  booking_reference: string;
  payment_status: string;
  payment_method: string;
  ticket_type: string;
  quantity: number;
  total_amount: number;
}

const Confirmation = () => {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const orderIds = JSON.parse(localStorage.getItem("orderIds") || "[]");
      
      if (orderIds.length === 0) {
        navigate("/");
        return;
      }

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("id", orderIds);

      if (error) throw error;
      setOrders(data || []);
      localStorage.removeItem("orderIds");
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-lusail">
        <div className="animate-pulse text-lg">{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4 font-lusail">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary/20 rounded-full mb-4">
            <Clock className="w-8 h-8 text-secondary" />
          </div>
          <h1 className="text-4xl font-bold mb-4">{t('bookingReceived')}</h1>
          <p className="text-lg text-muted-foreground">
            {t('bookingPending')}
          </p>
        </div>

        <Card className="p-8 mb-8">
          <div className="space-y-6">
            <div className="bg-accent/50 p-6 rounded-lg border-l-4 border-secondary">
              <h3 className="font-semibold text-lg mb-2">{t('paymentPendingTitle')}</h3>
              <p className="text-muted-foreground">
                {t('paymentPendingDesc')}
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">{t('bookingDetails')}</h3>
              {orders.map((order, index) => (
                <div key={order.id} className="mb-4 pb-4 border-b last:border-b-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">{t('bookingReference')}</p>
                      <p className="font-mono font-semibold text-lg">{order.booking_reference}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t('ticketType')}</p>
                      <p className="font-semibold capitalize">{order.ticket_type}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t('quantity')}</p>
                      <p className="font-semibold">{order.quantity}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t('amount')}</p>
                      <p className="font-semibold">{order.total_amount.toFixed(2)} {t('qar')}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t('paymentMethod')}</p>
                      <p className="font-semibold capitalize">
                        {order.payment_method === "sadad" ? t('sadadOnline') : t('cashAtVenue')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t('status')}</p>
                      <p className="font-semibold text-secondary capitalize">{order.payment_status}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-semibold mb-2">{t('nextSteps')}</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                  <span>{t('saveReference')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                  <span>{t('adminReview')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                  <span>{t('receiveEmail')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                  <span>{t('presentQR')}</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>

        <div className="text-center">
          <Button size="lg" onClick={() => navigate("/")}>
            {t('returnToHome')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Confirmation;

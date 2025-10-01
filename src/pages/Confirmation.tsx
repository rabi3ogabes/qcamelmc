import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary/20 rounded-full mb-4">
            <Clock className="w-8 h-8 text-secondary" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Booking Received!</h1>
          <p className="text-lg text-muted-foreground">
            Your booking is pending payment confirmation
          </p>
        </div>

        <Card className="p-8 mb-8">
          <div className="space-y-6">
            <div className="bg-accent/50 p-6 rounded-lg border-l-4 border-secondary">
              <h3 className="font-semibold text-lg mb-2">Payment Pending</h3>
              <p className="text-muted-foreground">
                Your booking has been created successfully. Our admin team will confirm your payment shortly.
                Once confirmed, you will receive your tickets with QR codes via email.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">Booking Details</h3>
              {orders.map((order, index) => (
                <div key={order.id} className="mb-4 pb-4 border-b last:border-b-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Booking Reference</p>
                      <p className="font-mono font-semibold text-lg">{order.booking_reference}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Ticket Type</p>
                      <p className="font-semibold capitalize">{order.ticket_type}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Quantity</p>
                      <p className="font-semibold">{order.quantity}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Amount</p>
                      <p className="font-semibold">{order.total_amount.toFixed(2)} QAR</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Payment Method</p>
                      <p className="font-semibold capitalize">
                        {order.payment_method === "sadad" ? "Sadad" : "Cash/POS at Venue"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <p className="font-semibold text-secondary capitalize">{order.payment_status}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Next Steps:</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                  <span>Save your booking reference for future reference</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                  <span>Our admin team will review and confirm your payment</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                  <span>You'll receive an email with your tickets and QR codes once confirmed</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                  <span>Present your QR code at the venue entrance on event day</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>

        <div className="text-center">
          <Button size="lg" onClick={() => navigate("/")}>
            Return to Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Confirmation;

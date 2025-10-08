import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { User, Phone, Mail, Ticket, Calendar } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  created_at: string;
  orders: Array<{
    id: string;
    booking_reference: string;
    ticket_type: string;
    quantity: number;
    total_amount: number;
    payment_status: string;
    created_at: string;
    ticket_holders: Array<{
      name: string;
      phone: string;
      nationality: string;
      ticket_type: string;
    }>;
  }>;
}

export const CustomersTab = () => {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select(`
          *,
          orders (
            id,
            booking_reference,
            ticket_type,
            quantity,
            total_amount,
            payment_status,
            created_at,
            ticket_holders (
              name,
              phone,
              nationality,
              ticket_type
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter out customers with no orders
      const customersWithOrders = (data || []).filter(
        (customer) => customer.orders && customer.orders.length > 0
      );

      setCustomers(customersWithOrders);
    } catch (error) {
      console.error("Error fetching customers:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm)
  );

  if (loading) {
    return <div className="text-center py-12 font-lusail">{t("loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold font-lusail">العملاء والحجوزات</h2>
        <Input
          placeholder="بحث بالاسم أو البريد أو الهاتف..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm font-lusail"
        />
      </div>

      {filteredCustomers.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground font-lusail">لا يوجد عملاء مع حجوزات</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredCustomers.map((customer) => (
            <Card key={customer.id} className="p-6">
              {/* Customer Info */}
              <div className="flex items-start justify-between mb-4 pb-4 border-b">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    <span className="font-bold text-lg font-lusail">{customer.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    <span className="font-lusail">{customer.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    <span className="font-lusail">{customer.phone}</span>
                  </div>
                </div>
                <Badge variant="outline" className="font-lusail">
                  {customer.orders.length} {customer.orders.length === 1 ? 'حجز' : 'حجوزات'}
                </Badge>
              </div>

              {/* Orders */}
              <div className="space-y-4">
                {customer.orders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-muted/30 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="font-semibold font-lusail">
                          {order.booking_reference}
                        </span>
                        <Badge
                          variant={
                            order.payment_status === "confirmed"
                              ? "default"
                              : order.payment_status === "pending"
                              ? "secondary"
                              : "destructive"
                          }
                          className="font-lusail"
                        >
                          {order.payment_status === "confirmed"
                            ? "مؤكد"
                            : order.payment_status === "pending"
                            ? "قيد الانتظار"
                            : "ملغي"}
                        </Badge>
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-primary font-lusail">
                          {parseFloat(order.total_amount.toString()).toFixed(2)} {t("qar")}
                        </div>
                        <div className="text-sm text-muted-foreground font-lusail">
                          {order.quantity} تذكرة
                        </div>
                      </div>
                    </div>

                    {/* Ticket Holders */}
                    {order.ticket_holders && order.ticket_holders.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Ticket className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-semibold font-lusail">
                            حاملو التذاكر:
                          </span>
                        </div>
                        <div className="grid gap-2">
                          {order.ticket_holders.map((holder, idx) => (
                            <div
                              key={idx}
                              className="bg-background rounded p-2 text-sm font-lusail"
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-medium">{holder.name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {holder.ticket_type.toUpperCase()}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {holder.phone} • {holder.nationality}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground font-lusail">
                      {new Date(order.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

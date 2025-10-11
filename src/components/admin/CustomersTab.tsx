import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { User, Phone, Mail, Ticket, Calendar, Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);

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

  const sendInvoiceToWhatsApp = async (customer: Customer, orderId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the customer dialog
    
    setSendingInvoice(orderId);
    
    try {
      // Fetch webhook URL from settings
      const { data: settings, error: settingsError } = await supabase
        .from("settings")
        .select("webhook_url")
        .maybeSingle();

      if (settingsError) throw settingsError;

      if (!settings?.webhook_url) {
        toast.error("لم يتم تكوين رابط n8n webhook في الإعدادات");
        return;
      }

      // Find the order
      const order = customer.orders.find(o => o.id === orderId);
      if (!order) {
        toast.error("لم يتم العثور على الطلب");
        return;
      }

      // Send to n8n webhook
      console.log("Sending invoice via n8n webhook:", settings.webhook_url);
      const response = await fetch(settings.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer: {
            id: customer.id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
          },
          order: {
            id: order.id,
            booking_reference: order.booking_reference,
            ticket_type: order.ticket_type,
            quantity: order.quantity,
            total_amount: order.total_amount,
            payment_status: order.payment_status,
          },
          ticketHolders: order.ticket_holders,
          bookingReference: order.booking_reference,
          timestamp: new Date().toISOString(),
          action: "send_invoice", // To differentiate from booking confirmation
        }),
      });

      if (!response.ok) {
        throw new Error("فشل إرسال الفاتورة");
      }

      toast.success("تم إرسال الفاتورة إلى واتساب بنجاح");
    } catch (error) {
      console.error("Error sending invoice:", error);
      toast.error("فشل إرسال الفاتورة. يرجى المحاولة مرة أخرى");
    } finally {
      setSendingInvoice(null);
    }
  };

  if (loading) {
    return <div className="text-center py-12 font-lusail">{t("loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold font-lusail">العملاء والحجوزات</h2>
        <Input
          placeholder="بحث بالاسم أو الهاتف..."
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredCustomers.map((customer) => (
            <Card
              key={customer.id}
              className="p-4 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedCustomer(customer)}
            >
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold font-lusail text-sm">{customer.name}</h3>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <p className="text-xs text-muted-foreground font-lusail">
                      {customer.phone}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`https://wa.me/${customer.phone.replace(/[^0-9]/g, '')}`, '_blank');
                      }}
                      className="text-green-600 hover:text-green-700 transition-colors"
                      title="إرسال رسالة واتساب"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <Badge variant="secondary" className="font-lusail text-xs">
                  {customer.orders.length} {customer.orders.length === 1 ? "حجز" : "حجوزات"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Customer Details Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-lusail text-2xl">تفاصيل العميل</DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-6">
              {/* Customer Info */}
              <Card className="p-4 bg-muted/30">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    <span className="font-bold text-lg font-lusail">{selectedCustomer.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    <span className="font-lusail">{selectedCustomer.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    <span className="font-lusail">{selectedCustomer.phone}</span>
                  </div>
                </div>
              </Card>

              {/* Orders */}
              <div className="space-y-4">
                <h3 className="font-bold text-lg font-lusail">الحجوزات</h3>
                {selectedCustomer.orders.map((order) => (
                  <Card key={order.id} className="p-4">
                    <div className="space-y-3">
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
                        <div className="flex items-center gap-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => sendInvoiceToWhatsApp(selectedCustomer, order.id, e)}
                            disabled={sendingInvoice === order.id}
                            title="إرسال الفاتورة عبر واتساب"
                          >
                            {sendingInvoice === order.id ? (
                              <span className="animate-spin">⏳</span>
                            ) : (
                              <Send className="w-4 h-4 text-green-600" />
                            )}
                          </Button>
                          <div className="text-left">
                            <div className="font-bold text-primary font-lusail">
                              {parseFloat(order.total_amount.toString()).toFixed(2)} {t("qar")}
                            </div>
                            <div className="text-sm text-muted-foreground font-lusail">
                              {order.quantity} تذكرة
                            </div>
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
                                className="bg-muted/30 rounded p-2 text-sm font-lusail"
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
                  </Card>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

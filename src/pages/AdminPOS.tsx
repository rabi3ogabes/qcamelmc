import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ShoppingCart, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface Ticket {
  id: string;
  type: string;
  price: number;
  available_quantity: number;
  sold_quantity: number;
  event_id: string;
}

const AdminPOS = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  const [selectedTicket, setSelectedTicket] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .order("type");

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error("Failed to load tickets:", error);
      toast({
        title: "خطأ",
        description: "فشل تحميل التذاكر",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTicketTypeName = (type: string) => {
    const types: { [key: string]: string } = {
      vip: "VIP",
      normal: "عادي",
      parking: "موقف سيارات",
    };
    return types[type] || type;
  };

  const selectedTicketData = tickets.find(t => t.id === selectedTicket);
  const totalAmount = selectedTicketData ? selectedTicketData.price * quantity : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedTicket || !customerName || !customerEmail || !customerPhone) {
      toast({
        title: "خطأ",
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);

    try {
      // Create customer
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .insert({
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
        })
        .select()
        .single();

      if (customerError) throw customerError;

      // Create order
      const { error: orderError } = await supabase
        .from("orders")
        .insert([{
          customer_id: customerData.id,
          event_id: selectedTicketData!.event_id,
          ticket_type: selectedTicketData!.type as "vip" | "normal" | "parking",
          quantity: quantity,
          total_amount: totalAmount,
          payment_method: "cash_pos",
          payment_status: "confirmed" as const,
          booking_reference: `POS-${Date.now()}`,
        }]);

      if (orderError) throw orderError;

      // Update ticket sold quantity
      const { error: updateError } = await supabase
        .from("tickets")
        .update({
          sold_quantity: (selectedTicketData!.sold_quantity || 0) + quantity,
        })
        .eq("id", selectedTicket);

      if (updateError) throw updateError;

      toast({
        title: "نجح",
        description: "تم إنشاء الطلب بنجاح",
      });

      // Reset form
      setSelectedTicket("");
      setQuantity(1);
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      
      fetchTickets();
    } catch (error) {
      console.error("Error creating order:", error);
      toast({
        title: "خطأ",
        description: "فشل إنشاء الطلب",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4 font-lusail" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Button variant="outline" onClick={() => navigate("/admin/dashboard")}>
            <ArrowLeft className="w-4 h-4 ml-2" />
            العودة للوحة التحكم
          </Button>
          <h1 className="text-4xl font-bold">نقاط البيع - بيع تذكرة</h1>
        </div>

        {loading ? (
          <div className="text-center py-12">جاري التحميل...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    اختيار التذكرة
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="ticket">نوع التذكرة</Label>
                    <Select value={selectedTicket} onValueChange={setSelectedTicket}>
                      <SelectTrigger id="ticket">
                        <SelectValue placeholder="اختر نوع التذكرة" />
                      </SelectTrigger>
                      <SelectContent>
                        {tickets.map((ticket) => (
                          <SelectItem key={ticket.id} value={ticket.id}>
                            {getTicketTypeName(ticket.type)} - {ticket.price} ريال
                            ({ticket.available_quantity - (ticket.sold_quantity || 0)} متاح)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="quantity">الكمية</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      max={selectedTicketData ? selectedTicketData.available_quantity - (selectedTicketData.sold_quantity || 0) : 1}
                      value={quantity}
                      onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                      required
                    />
                  </div>

                  {selectedTicketData && (
                    <div className="pt-4 border-t">
                      <div className="flex justify-between text-lg font-bold">
                        <span>الإجمالي:</span>
                        <span>{totalAmount} ريال</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>معلومات العميل</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="name">الاسم *</Label>
                    <Input
                      id="name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">البريد الإلكتروني *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone">رقم الهاتف *</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="974XXXXXXXX"
                      required
                    />
                  </div>
                </CardContent>
              </Card>

              <Button type="submit" size="lg" disabled={processing} className="w-full">
                {processing ? "جاري المعالجة..." : "إتمام الشراء وإرسال الفاتورة"}
                <ArrowRight className="w-4 h-4 mr-2" />
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default AdminPOS;

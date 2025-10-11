import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ShoppingCart } from "lucide-react";
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
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  
  const [selectedTicket, setSelectedTicket] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNationality, setCustomerNationality] = useState("");

  useEffect(() => {
    fetchTickets();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("logo_url, header_bg_color")
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    if (data?.logo_url) {
      setLogoUrl(data.logo_url);
    }
    
    if (data?.header_bg_color) {
      setHeaderBgColor(data.header_bg_color);
    }
  };

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

  const getMaxQuantity = (ticketType: string) => {
    if (ticketType === "vip" || ticketType === "normal") {
      return 5;
    }
    return selectedTicketData ? selectedTicketData.available_quantity - (selectedTicketData.sold_quantity || 0) : 10;
  };

  const selectedTicketData = tickets.find(t => t.id === selectedTicket);
  const maxQuantity = selectedTicketData ? Math.min(
    getMaxQuantity(selectedTicketData.type),
    selectedTicketData.available_quantity - (selectedTicketData.sold_quantity || 0)
  ) : 5;
  const totalAmount = selectedTicketData ? selectedTicketData.price * quantity : 0;

  const nationalities = [
    "قطري", "سعودي", "إماراتي", "كويتي", "بحريني", "عماني",
    "مصري", "أردني", "لبناني", "سوري", "عراقي", "يمني",
    "مغربي", "جزائري", "تونسي", "ليبي", "سوداني", "فلسطيني",
    "باكستاني", "هندي", "بنغالي", "فلبيني", "إندونيسي", "نيبالي",
    "أمريكي", "بريطاني", "فرنسي", "ألماني", "إيطالي", "أسباني",
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedTicket || !customerName || !customerEmail || !customerPhone || !customerNationality) {
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
          nationality: customerNationality,
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
      setCustomerNationality("");
      
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
    <div className="min-h-screen bg-background font-lusail" dir="rtl">
      {/* Header */}
      <header className="border-b backdrop-blur-sm sticky top-0 z-10" style={{ backgroundColor: headerBgColor }}>
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-12 object-contain" />
          ) : (
            <h1 className="text-2xl font-bold">نقاط البيع</h1>
          )}
          <h2 className="text-xl font-semibold">بيع تذكرة</h2>
        </div>
      </header>

      <div className="max-w-4xl mx-auto py-8 px-4">{loading ? (
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
                <CardContent className="space-y-6">
                  <div>
                    <Label className="mb-3 block">نوع التذكرة</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {tickets.map((ticket) => {
                        const available = ticket.available_quantity - (ticket.sold_quantity || 0);
                        return (
                          <Button
                            key={ticket.id}
                            type="button"
                            variant={selectedTicket === ticket.id ? "default" : "outline"}
                            className="h-20 flex flex-col items-center justify-center gap-1"
                            onClick={() => {
                              setSelectedTicket(ticket.id);
                              setQuantity(1);
                            }}
                            disabled={available === 0}
                          >
                            <span className="text-lg font-bold">{getTicketTypeName(ticket.type)}</span>
                            <span className="text-sm">{ticket.price} ریال</span>
                            <span className="text-xs opacity-70">({available} متاح)</span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedTicketData && (
                    <div>
                      <Label className="mb-3 block">الكمية (الحد الأقصى: {maxQuantity})</Label>
                      <div className="grid grid-cols-5 gap-2">
                        {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((num) => (
                          <Button
                            key={num}
                            type="button"
                            variant={quantity === num ? "default" : "outline"}
                            className="h-16 text-xl font-bold"
                            onClick={() => setQuantity(num)}
                          >
                            {num}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

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

                  <div>
                    <Label className="mb-3 block">الجنسية *</Label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {nationalities.map((nationality) => (
                        <Button
                          key={nationality}
                          type="button"
                          variant={customerNationality === nationality ? "default" : "outline"}
                          className="h-12 text-sm"
                          onClick={() => setCustomerNationality(nationality)}
                        >
                          {nationality}
                        </Button>
                      ))}
                    </div>
                    {customerNationality && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        الجنسية المختارة: <span className="font-bold">{customerNationality}</span>
                      </div>
                    )}
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

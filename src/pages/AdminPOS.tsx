import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ShoppingCart, Trash2, Plus, Minus } from "lucide-react";
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

interface CartItem {
  ticketId: string;
  ticketType: string;
  quantity: number;
  price: number;
  eventId: string;
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
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNationality, setCustomerNationality] = useState("");
  const [showAllNationalities, setShowAllNationalities] = useState(false);

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

  const getTotalVipNormalInCart = () => {
    return cart.reduce((total, item) => {
      if (item.ticketType === "vip" || item.ticketType === "normal") {
        return total + item.quantity;
      }
      return total;
    }, 0);
  };

  const canAddToCart = (ticketType: string, quantity: number) => {
    const currentVipNormal = getTotalVipNormalInCart();
    if (ticketType === "vip" || ticketType === "normal") {
      return (currentVipNormal + quantity) <= 5;
    }
    return true;
  };

  const addToCart = (ticket: Ticket, quantity: number) => {
    if (!canAddToCart(ticket.type, quantity)) {
      toast({
        title: "خطأ",
        description: "الحد الأقصى لتذاكر VIP والعادي معاً هو 5",
        variant: "destructive",
      });
      return;
    }

    const existingItem = cart.find(item => item.ticketId === ticket.id);
    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      if (!canAddToCart(ticket.type, quantity)) {
        toast({
          title: "خطأ",
          description: "الحد الأقصى لتذاكر VIP والعادي معاً هو 5",
          variant: "destructive",
        });
        return;
      }
      setCart(cart.map(item =>
        item.ticketId === ticket.id
          ? { ...item, quantity: newQuantity }
          : item
      ));
    } else {
      setCart([...cart, {
        ticketId: ticket.id,
        ticketType: ticket.type,
        quantity: quantity,
        price: ticket.price,
        eventId: ticket.event_id,
      }]);
    }

    toast({
      title: "تمت الإضافة",
      description: `تم إضافة ${quantity} ${getTicketTypeName(ticket.type)} للسلة`,
    });
  };

  const removeFromCart = (ticketId: string) => {
    setCart(cart.filter(item => item.ticketId !== ticketId));
  };

  const updateCartItemQuantity = (ticketId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      removeFromCart(ticketId);
      return;
    }

    const item = cart.find(i => i.ticketId === ticketId);
    if (!item) return;

    const otherVipNormal = cart.reduce((total, i) => {
      if (i.ticketId !== ticketId && (i.ticketType === "vip" || i.ticketType === "normal")) {
        return total + i.quantity;
      }
      return total;
    }, 0);

    if ((item.ticketType === "vip" || item.ticketType === "normal") && (otherVipNormal + newQuantity) > 5) {
      toast({
        title: "خطأ",
        description: "الحد الأقصى لتذاكر VIP والعادي معاً هو 5",
        variant: "destructive",
      });
      return;
    }

    setCart(cart.map(item =>
      item.ticketId === ticketId
        ? { ...item, quantity: newQuantity }
        : item
    ));
  };

  const totalAmount = cart.reduce((total, item) => total + (item.price * item.quantity), 0);

  const gulfNationalities = [
    { name: "قطري", flag: "🇶🇦" },
    { name: "سعودي", flag: "🇸🇦" },
    { name: "إماراتي", flag: "🇦🇪" },
    { name: "كويتي", flag: "🇰🇼" },
    { name: "بحريني", flag: "🇧🇭" },
    { name: "عماني", flag: "🇴🇲" },
  ];

  const otherNationalities = [
    { name: "مصري", flag: "🇪🇬" },
    { name: "أردني", flag: "🇯🇴" },
    { name: "لبناني", flag: "🇱🇧" },
    { name: "سوري", flag: "🇸🇾" },
    { name: "عراقي", flag: "🇮🇶" },
    { name: "يمني", flag: "🇾🇪" },
    { name: "مغربي", flag: "🇲🇦" },
    { name: "جزائري", flag: "🇩🇿" },
    { name: "تونسي", flag: "🇹🇳" },
    { name: "ليبي", flag: "🇱🇾" },
    { name: "سوداني", flag: "🇸🇩" },
    { name: "فلسطيني", flag: "🇵🇸" },
    { name: "باكستاني", flag: "🇵🇰" },
    { name: "هندي", flag: "🇮🇳" },
    { name: "بنغالي", flag: "🇧🇩" },
    { name: "فلبيني", flag: "🇵🇭" },
    { name: "إندونيسي", flag: "🇮🇩" },
    { name: "نيبالي", flag: "🇳🇵" },
    { name: "أمريكي", flag: "🇺🇸" },
    { name: "بريطاني", flag: "🇬🇧" },
    { name: "فرنسي", flag: "🇫🇷" },
    { name: "ألماني", flag: "🇩🇪" },
    { name: "إيطالي", flag: "🇮🇹" },
    { name: "أسباني", flag: "🇪🇸" },
  ];

  const displayedNationalities = showAllNationalities 
    ? [...gulfNationalities, ...otherNationalities]
    : gulfNationalities;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (cart.length === 0) {
      toast({
        title: "خطأ",
        description: "السلة فارغة، يرجى إضافة تذاكر",
        variant: "destructive",
      });
      return;
    }

    if (!customerName || !customerEmail || !customerPhone || !customerNationality) {
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

      // Create orders for each cart item
      const orders = cart.map(item => ({
        customer_id: customerData.id,
        event_id: item.eventId,
        ticket_type: item.ticketType as "vip" | "normal" | "parking",
        quantity: item.quantity,
        total_amount: item.price * item.quantity,
        payment_method: "cash_pos" as const,
        payment_status: "confirmed" as const,
        booking_reference: `POS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }));

      const { error: orderError } = await supabase
        .from("orders")
        .insert(orders);

      if (orderError) throw orderError;

      // Update ticket sold quantities
      for (const item of cart) {
        const ticket = tickets.find(t => t.id === item.ticketId);
        if (ticket) {
          const { error: updateError } = await supabase
            .from("tickets")
            .update({
              sold_quantity: (ticket.sold_quantity || 0) + item.quantity,
            })
            .eq("id", item.ticketId);

          if (updateError) throw updateError;
        }
      }

      toast({
        title: "نجح",
        description: "تم إنشاء الطلبات بنجاح",
      });

      // Reset form
      setCart([]);
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setCustomerNationality("");
      setShowAllNationalities(false);
      
      fetchTickets();
    } catch (error) {
      console.error("Error creating orders:", error);
      toast({
        title: "خطأ",
        description: "فشل إنشاء الطلبات",
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
                    إضافة التذاكر
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {tickets.map((ticket) => {
                    const available = ticket.available_quantity - (ticket.sold_quantity || 0);
                    const [tempQty, setTempQty] = useState(1);
                    
                    return (
                      <div key={ticket.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <h3 className="text-lg font-bold">{getTicketTypeName(ticket.type)}</h3>
                            <p className="text-sm text-muted-foreground">{ticket.price} ريال</p>
                            <p className="text-xs text-muted-foreground">({available} متاح)</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setTempQty(Math.max(1, tempQty - 1))}
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                            <span className="w-12 text-center font-bold">{tempQty}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setTempQty(Math.min(available, tempQty + 1))}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              onClick={() => {
                                addToCart(ticket, tempQty);
                                setTempQty(1);
                              }}
                              disabled={available === 0}
                            >
                              إضافة
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {getTotalVipNormalInCart() > 0 && (
                    <div className="text-sm text-muted-foreground">
                      تذاكر VIP والعادي في السلة: {getTotalVipNormalInCart()} / 5
                    </div>
                  )}
                </CardContent>
              </Card>

              {cart.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>السلة</span>
                      <span className="text-base font-normal">{cart.length} نوع</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {cart.map((item) => (
                      <div key={item.ticketId} className="flex justify-between items-center p-3 border rounded-lg">
                        <div>
                          <h4 className="font-bold">{getTicketTypeName(item.ticketType)}</h4>
                          <p className="text-sm text-muted-foreground">{item.price} ريال × {item.quantity}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateCartItemQuantity(item.ticketId, item.quantity - 1)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-8 text-center font-bold">{item.quantity}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateCartItemQuantity(item.ticketId, item.quantity + 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          <span className="font-bold min-w-[80px] text-right">{item.price * item.quantity} ريال</span>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeFromCart(item.ticketId)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    
                    <div className="pt-3 border-t">
                      <div className="flex justify-between text-lg font-bold">
                        <span>الإجمالي الكلي:</span>
                        <span>{totalAmount} ريال</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

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
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {displayedNationalities.map((nationality) => (
                        <Button
                          key={nationality.name}
                          type="button"
                          variant={customerNationality === nationality.name ? "default" : "outline"}
                          className="h-14 text-base flex items-center justify-center gap-2"
                          onClick={() => setCustomerNationality(nationality.name)}
                        >
                          {nationality.flag && <span className="text-2xl">{nationality.flag}</span>}
                          <span>{nationality.name}</span>
                        </Button>
                      ))}
                    </div>
                    
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full mt-3"
                      onClick={() => setShowAllNationalities(!showAllNationalities)}
                    >
                      {showAllNationalities ? "إخفاء الجنسيات الأخرى" : "عرض المزيد من الجنسيات"}
                    </Button>

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

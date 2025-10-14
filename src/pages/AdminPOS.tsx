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
import { TicketAddItem } from "@/components/admin/TicketAddItem";

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

interface TicketHolderInput {
  name: string;
  nationality: string;
  idNumber: string;
  phone: string;
  ticketType: string;
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
  const [customerIdNumber, setCustomerIdNumber] = useState("");
  const [showAllNationalities, setShowAllNationalities] = useState(false);
  const [ticketHolders, setTicketHolders] = useState<TicketHolderInput[]>([]);

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
    const existingItem = cart.find(item => item.ticketId === ticket.id);
    
    // Calculate what the new total would be
    let totalVipNormalAfterAdd = getTotalVipNormalInCart();
    if (ticket.type === "vip" || ticket.type === "normal") {
      totalVipNormalAfterAdd += quantity;
    }
    
    // Check if adding this quantity would exceed the limit
    if ((ticket.type === "vip" || ticket.type === "normal") && totalVipNormalAfterAdd > 5) {
      toast({
        title: "خطأ",
        description: "الحد الأقصى لتذاكر VIP والعادي معاً هو 5",
        variant: "destructive",
      });
      return;
    }

    if (existingItem) {
      setCart(cart.map(item =>
        item.ticketId === ticket.id
          ? { ...item, quantity: item.quantity + quantity }
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

    // Add ticket holder slots for the new tickets
    const newHolders = Array(quantity).fill(null).map(() => ({
      name: "",
      nationality: "",
      idNumber: "",
      phone: "",
      ticketType: ticket.type
    }));
    setTicketHolders([...ticketHolders, ...newHolders]);

    toast({
      title: "تمت الإضافة",
      description: `تم إضافة ${quantity} ${getTicketTypeName(ticket.type)} للسلة`,
    });
  };

  const removeFromCart = (ticketId: string) => {
    const item = cart.find((item) => item.ticketId === ticketId);
    if (!item) return;

    setCart(cart.filter(cartItem => cartItem.ticketId !== ticketId));
    // Remove all ticket holders of this type
    setTicketHolders(ticketHolders.filter(h => h.ticketType !== item.ticketType));
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

    const currentQuantity = item.quantity;
    const difference = newQuantity - currentQuantity;

    setCart(cart.map(cartItem =>
      cartItem.ticketId === ticketId
        ? { ...cartItem, quantity: newQuantity }
        : cartItem
    ));

    // Adjust ticket holders
    if (difference > 0) {
      // Add more holders
      const newHolders = Array(difference).fill(null).map(() => ({
        name: "",
        nationality: "",
        idNumber: "",
        phone: "",
        ticketType: item.ticketType
      }));
      setTicketHolders([...ticketHolders, ...newHolders]);
    } else if (difference < 0) {
      // Remove holders
      const holdersOfType = ticketHolders
        .map((h, i) => ({ ...h, index: i }))
        .filter(h => h.ticketType === item.ticketType);
      
      const indicesToRemove = holdersOfType
        .slice(difference)
        .map(h => h.index);
      
      setTicketHolders(ticketHolders.filter((_, i) => !indicesToRemove.includes(i)));
    }
  };

  const updateTicketHolder = (index: number, field: keyof TicketHolderInput, value: string) => {
    const updated = [...ticketHolders];
    updated[index] = { ...updated[index], [field]: value };
    setTicketHolders(updated);
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

    // Validate all ticket holders have required info
    const totalTickets = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (ticketHolders.length !== totalTickets) {
      toast({
        title: "خطأ",
        description: "يرجى ملء معلومات جميع حاملي التذاكر",
        variant: "destructive",
      });
      return;
    }

    const incompleteHolders = ticketHolders.some(h => !h.name || !h.nationality || !h.idNumber);
    if (incompleteHolders) {
      toast({
        title: "خطأ",
        description: "يرجى ملء الاسم والجنسية ورقم الهوية لجميع حاملي التذاكر",
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

      // Create a single order with all tickets
      const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const bookingRef = `POS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_id: customerData.id,
          event_id: cart[0].eventId,
          ticket_type: cart[0].ticketType as "vip" | "normal" | "parking",
          quantity: cart.reduce((sum, item) => sum + item.quantity, 0),
          total_amount: totalAmount,
          payment_method: "cash_pos" as const,
          payment_status: "confirmed" as const,
          booking_reference: bookingRef,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create ticket holders with QR codes
      const holdersToInsert = await Promise.all(ticketHolders.map(async (holder, index) => {
        const ticketRef = `${bookingRef}-TKT${(index + 1).toString().padStart(2, '0')}`;
        
        // Generate QR code and upload to storage
        try {
          const { data: qrData, error: qrError } = await supabase.functions.invoke('generate-qr-code', {
            body: { text: ticketRef, filename: ticketRef }
          });

          return {
            order_id: orderData.id,
            name: holder.name,
            phone: holder.phone || customerPhone,
            nationality: holder.nationality,
            ticket_type: holder.ticketType,
            qr_code: qrData?.url || ticketRef,
            id_number: holder.idNumber
          };
        } catch (error) {
          console.error('QR generation failed:', error);
          return {
            order_id: orderData.id,
            name: holder.name,
            phone: holder.phone || customerPhone,
            nationality: holder.nationality,
            ticket_type: holder.ticketType,
            qr_code: ticketRef,
            id_number: holder.idNumber
          };
        }
      }));

      const { error: holdersError } = await supabase
        .from("ticket_holders")
        .insert(holdersToInsert);

      if (holdersError) throw holdersError;

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
      setTicketHolders([]);
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setCustomerNationality("");
      setCustomerIdNumber("");
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
          <button onClick={() => navigate("/")} className="focus:outline-none hover:opacity-80 transition-opacity">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-12 object-contain" />
            ) : (
              <h1 className="text-2xl font-bold">نقاط البيع</h1>
            )}
          </button>
          <h2 className="text-xl font-semibold bg-yellow-400 px-4 py-2 rounded">بيع تذكرة</h2>
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
                  {tickets.map((ticket) => (
                    <TicketAddItem
                      key={ticket.id}
                      ticket={ticket}
                      onAddToCart={addToCart}
                      getTicketTypeName={getTicketTypeName}
                    />
                  ))}
                  
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

              {/* Ticket Holders Details */}
              {ticketHolders.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>معلومات حاملي التذاكر ({ticketHolders.length} تذاكر)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {ticketHolders.map((holder, index) => (
                      <div key={index} className="p-4 border rounded-lg space-y-3 bg-muted/50">
                        <h4 className="font-bold text-primary">
                          التذكرة #{index + 1} - {getTicketTypeName(holder.ticketType)}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <Label htmlFor={`holder-name-${index}`}>الاسم *</Label>
                            <Input
                              id={`holder-name-${index}`}
                              value={holder.name}
                              onChange={(e) => updateTicketHolder(index, 'name', e.target.value)}
                              placeholder="اسم حامل التذكرة"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor={`holder-nationality-${index}`}>الجنسية *</Label>
                            <Select
                              value={holder.nationality}
                              onValueChange={(value) => updateTicketHolder(index, 'nationality', value)}
                            >
                              <SelectTrigger id={`holder-nationality-${index}`}>
                                <SelectValue placeholder="اختر الجنسية" />
                              </SelectTrigger>
                              <SelectContent>
                                {gulfNationalities.map((nat) => (
                                  <SelectItem key={nat.name} value={nat.name}>
                                    {nat.flag} {nat.name}
                                  </SelectItem>
                                ))}
                                {otherNationalities.map((nat) => (
                                  <SelectItem key={nat.name} value={nat.name}>
                                    {nat.flag} {nat.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor={`holder-id-${index}`}>رقم الهوية *</Label>
                            <Input
                              id={`holder-id-${index}`}
                              value={holder.idNumber}
                              onChange={(e) => updateTicketHolder(index, 'idNumber', e.target.value)}
                              placeholder="رقم الهوية"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    ))}
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

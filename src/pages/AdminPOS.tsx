import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ShoppingCart, Trash2, Plus, Minus, Maximize, Minimize } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { TicketAddItem } from "@/components/admin/TicketAddItem";
import { api, apiErrorMessage, type ApiError } from "@/lib/api";

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
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    fetchTickets();
    fetchSettings();
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        toast({
          title: "خطأ",
          description: "لا يمكن تفعيل وضع ملء الشاشة",
          variant: "destructive",
        });
      });
    } else {
      document.exitFullscreen();
    }
  };

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

  const deleteTicketHolder = (index: number) => {
    const holder = ticketHolders[index];
    
    // Remove the holder from the array
    const updatedHolders = ticketHolders.filter((_, i) => i !== index);
    setTicketHolders(updatedHolders);

    // Update the cart - decrease quantity for this ticket type
    const cartItem = cart.find(item => item.ticketType === holder.ticketType);
    if (cartItem) {
      const newQuantity = cartItem.quantity - 1;
      if (newQuantity <= 0) {
        setCart(cart.filter(item => item.ticketId !== cartItem.ticketId));
      } else {
        setCart(cart.map(item =>
          item.ticketId === cartItem.ticketId
            ? { ...item, quantity: newQuantity }
            : item
        ));
      }
    }

    toast({
      title: "تم الحذف",
      description: "تم حذف بيانات حامل التذكرة",
    });
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

    // One event per order (the server enforces this too)
    if (new Set(cart.map((item) => item.eventId)).size > 1) {
      toast({
        title: "خطأ",
        description: "لا يمكن الجمع بين تذاكر فعاليات مختلفة في طلب واحد",
        variant: "destructive",
      });
      return;
    }

    // Each holder belongs to the cart line of their ticket type
    const holders = ticketHolders.flatMap((holder) => {
      const line = cart.find((item) => item.ticketType === holder.ticketType);
      return line
        ? [{
            ticket_id: line.ticketId,
            name: holder.name.trim(),
            phone: (holder.phone || customerPhone).trim(),
            nationality: holder.nationality,
            id_number: holder.idNumber.trim(),
          }]
        : [];
    });

    setProcessing(true);

    try {
      // Prices, stock, the confirmed status and the QR codes are all decided by the server
      const result = await api.createOrder({
        source: "pos",
        payment_method: "cash_pos",
        customer: {
          name: customerName.trim(),
          email: customerEmail.trim(),
          phone: customerPhone.trim(),
          country_code: "+974",
          nationality: customerNationality,
          id_number: (customerIdNumber || ticketHolders[0]?.idNumber || "").trim(),
        },
        items: cart.map((item) => ({ ticket_id: item.ticketId, quantity: item.quantity })),
        holders,
      });

      if (result.ok === false) throw result.error;

      toast({
        title: "نجح",
        description: `تم إنشاء الطلب ${result.data.order.booking_reference} بنجاح`,
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
        description: apiErrorMessage(error as ApiError, t),
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
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold bg-yellow-400 px-4 py-2 rounded">بيع تذكرة</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              title={isFullscreen ? "تصغير الشاشة" : "ملء الشاشة"}
            >
              {isFullscreen ? (
                <Minimize className="w-5 h-5" />
              ) : (
                <Maximize className="w-5 h-5" />
              )}
            </Button>
          </div>
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
                        <div className="flex justify-between items-center">
                          <h4 className="font-bold text-primary">
                            التذكرة #{index + 1} - {getTicketTypeName(holder.ticketType)}
                          </h4>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => deleteTicketHolder(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
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

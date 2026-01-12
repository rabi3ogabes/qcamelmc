import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ShoppingCart, Trash2, Plus, Minus, Maximize, Minimize, CalendarIcon, CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { TicketAddItem } from "@/components/admin/TicketAddItem";
import { format } from "date-fns";
import { canPurchaseTickets } from "@/lib/eventUtils";
import { useActivityLog } from "@/hooks/useActivityLog";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface SuccessData {
  totalTickets: number;
  mainName: string;
  ticketHolders: { name: string; ticketType: string }[];
  ticketTypes: { type: string; quantity: number }[];
}

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
  countryCode: string;
  ticketType: string;
}

const AdminPOS = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { logActivity } = useActivityLog();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCountryCode, setCustomerCountryCode] = useState("+974");
  const [customerNationality, setCustomerNationality] = useState("قطر");
  const [customerIdNumber, setCustomerIdNumber] = useState("");
  const [showAllNationalities, setShowAllNationalities] = useState(false);
  const [ticketHolders, setTicketHolders] = useState<TicketHolderInput[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);

  useEffect(() => {
    // Fetch the upcoming event automatically
    const fetchUpcomingEvent = async () => {
      try {
        const { data, error } = await supabase
          .from("events")
          .select("id, event_date")
          .eq("is_active", true)
          .order("event_date", { ascending: true });

        if (error) {
          console.error("Error fetching upcoming event:", error);
          throw error;
        }
        
        console.log("Upcoming event data:", data);
        
        // Filter to find the first event that still allows ticket purchases
        const availableEvent = data?.find(event => canPurchaseTickets(event.event_date));
        
        if (availableEvent) {
          setSelectedDate(new Date(availableEvent.event_date));
          setCurrentEventId(availableEvent.id);
          // Store the event ID to fetch tickets for this specific event
          fetchTicketsForEvent(availableEvent.id);
          console.log("Selected date set to:", new Date(availableEvent.event_date));
        } else {
          console.log("No upcoming events found");
        }
      } catch (error) {
        console.error("Failed to fetch upcoming event:", error);
      }
    };

    fetchUpcomingEvent();
    fetchSettings();
  }, []);

  const handleDateSelect = async (date: Date | undefined) => {
    if (!date) return;
    
    setSelectedDate(date);
    setLoading(true);
    
    try {
      // Fetch event for the selected date
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const { data, error } = await supabase
        .from("events")
        .select("id")
        .gte("event_date", startOfDay.toISOString())
        .lte("event_date", endOfDay.toISOString())
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setCurrentEventId(data.id);
        await fetchTicketsForEvent(data.id);
      } else {
        setTickets([]);
        toast({
          title: "تنبيه",
          description: "لا توجد فعاليات في هذا التاريخ",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Failed to fetch event for date:", error);
      toast({
        title: "خطأ",
        description: "فشل تحميل الفعالية",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Real-time subscription for ticket availability
  useEffect(() => {
    if (!currentEventId) return;

    const channel = supabase
      .channel('tickets-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          filter: `event_id=eq.${currentEventId}`
        },
        (payload) => {
          console.log('Ticket update received:', payload);
          setTickets(prevTickets => 
            prevTickets.map(ticket => 
              ticket.id === payload.new.id 
                ? { ...ticket, sold_quantity: payload.new.sold_quantity, available_quantity: payload.new.available_quantity }
                : ticket
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentEventId]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Auto-populate name, phone and ID number from the main customer info to all ticket holders
  useEffect(() => {
    setTicketHolders(prev => prev.map(holder => ({
      ...holder,
      name: customerName,
    })));
  }, [customerName, ticketHolders.length]);

  useEffect(() => {
    if (customerPhone) {
      setTicketHolders(prev => prev.map(holder => ({
        ...holder,
        phone: customerPhone,
        countryCode: customerCountryCode
      })));
    }
  }, [customerPhone, customerCountryCode]);

  useEffect(() => {
    if (customerIdNumber) {
      setTicketHolders(prev => prev.map(holder => ({
        ...holder,
        idNumber: customerIdNumber
      })));
    }
  }, [customerIdNumber]);

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

  const fetchTicketsForEvent = async (eventId: string) => {
    try {
      console.log("Fetching tickets for event ID:", eventId);
      
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("event_id", eventId)
        .order("type");

      if (error) throw error;
      console.log("Fetched tickets:", data);
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
    console.log("addToCart called with:", { ticket, quantity });
    console.log("Current cart:", cart);
    
    // Check if adding would exceed maximum available tickets
    const remainingTickets = ticket.available_quantity - ticket.sold_quantity;
    const existingItem = cart.find(item => item.ticketId === ticket.id);
    const currentInCart = existingItem ? existingItem.quantity : 0;
    
    if (currentInCart + quantity > remainingTickets) {
      toast({
        title: "خطأ",
        description: `لا يمكن إضافة هذا العدد. المتبقي: ${remainingTickets - currentInCart} تذاكر فقط`,
        variant: "destructive",
      });
      return;
    }
    
    // Calculate what the new total would be
    let totalVipNormalAfterAdd = getTotalVipNormalInCart();
    if (ticket.type === "vip" || ticket.type === "normal") {
      totalVipNormalAfterAdd += quantity;
    }
    
    // Check if adding this quantity would exceed the limit
    if ((ticket.type === "vip" || ticket.type === "normal") && totalVipNormalAfterAdd > 5) {
      console.log("Exceeding limit, showing error");
      toast({
        title: "خطأ",
        description: "الحد الأقصى لتذاكر VIP والعادي معاً هو 5",
        variant: "destructive",
      });
      return;
    }

    if (existingItem) {
      console.log("Updating existing item");
      setCart(cart.map(item =>
        item.ticketId === ticket.id
          ? { ...item, quantity: item.quantity + quantity }
          : item
      ));
    } else {
      console.log("Adding new item to cart");
      setCart([...cart, {
        ticketId: ticket.id,
        ticketType: ticket.type,
        quantity: quantity,
        price: ticket.price,
        eventId: ticket.event_id,
      }]);
    }

    // Add ticket holder slots for the new tickets with default nationality "قطر"
    // We create (quantity - 1) holders for the FIRST addition only (customer takes first ticket)
    // For subsequent additions, we create full quantity of holders
    const isFirstAddition = cart.length === 0;
    const holdersToAdd = isFirstAddition ? Math.max(0, quantity - 1) : quantity;
    
    const newHolders = Array(holdersToAdd).fill(null).map((_, index) => ({
      name: "",
      nationality: "قطر",
      idNumber: "",
      phone: "",
      countryCode: "+974",
      ticketType: ticket.type
    }));
    console.log("Adding ticket holders:", newHolders, "isFirstAddition:", isFirstAddition);
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

    // Check if new quantity exceeds maximum available
    const ticket = tickets.find(t => t.id === ticketId);
    if (ticket) {
      const remainingTickets = ticket.available_quantity - ticket.sold_quantity;
      if (newQuantity > remainingTickets) {
        toast({
          title: "خطأ",
          description: `لا يمكن تجاوز الحد الأقصى. المتبقي: ${remainingTickets} تذاكر`,
          variant: "destructive",
        });
        return;
      }
    }

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
      // Add more holders with default nationality "قطر"
      // We add (difference) holders since customer already counts as one
      const newHolders = Array(difference).fill(null).map(() => ({
        name: "",
        nationality: "قطر",
        idNumber: "",
        phone: "",
        countryCode: "+974",
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

  const countryCodes = [
    { code: "+974", country: "قطر", flag: "🇶🇦" },
    { code: "+966", country: "السعودية", flag: "🇸🇦" },
    { code: "+971", country: "الإمارات", flag: "🇦🇪" },
    { code: "+965", country: "الكويت", flag: "🇰🇼" },
    { code: "+973", country: "البحرين", flag: "🇧🇭" },
    { code: "+968", country: "عمان", flag: "🇴🇲" },
    { code: "+20", country: "مصر", flag: "🇪🇬" },
    { code: "+962", country: "الأردن", flag: "🇯🇴" },
    { code: "+961", country: "لبنان", flag: "🇱🇧" },
    { code: "+963", country: "سوريا", flag: "🇸🇾" },
    { code: "+964", country: "العراق", flag: "🇮🇶" },
    { code: "+967", country: "اليمن", flag: "🇾🇪" },
    { code: "+212", country: "المغرب", flag: "🇲🇦" },
    { code: "+213", country: "الجزائر", flag: "🇩🇿" },
    { code: "+216", country: "تونس", flag: "🇹🇳" },
    { code: "+218", country: "ليبيا", flag: "🇱🇾" },
    { code: "+249", country: "السودان", flag: "🇸🇩" },
    { code: "+970", country: "فلسطين", flag: "🇵🇸" },
    { code: "+92", country: "باكستان", flag: "🇵🇰" },
    { code: "+91", country: "الهند", flag: "🇮🇳" },
    { code: "+880", country: "بنغلاديش", flag: "🇧🇩" },
    { code: "+63", country: "الفلبين", flag: "🇵🇭" },
    { code: "+62", country: "إندونيسيا", flag: "🇮🇩" },
    { code: "+977", country: "نيبال", flag: "🇳🇵" },
    { code: "+1", country: "أمريكا", flag: "🇺🇸" },
    { code: "+44", country: "بريطانيا", flag: "🇬🇧" },
    { code: "+33", country: "فرنسا", flag: "🇫🇷" },
    { code: "+49", country: "ألمانيا", flag: "🇩🇪" },
    { code: "+39", country: "إيطاليا", flag: "🇮🇹" },
    { code: "+34", country: "أسبانيا", flag: "🇪🇸" },
  ];

  const gulfNationalities = [
    { name: "قطر", flag: "🇶🇦" },
    { name: "السعودية", flag: "🇸🇦" },
    { name: "الإمارات", flag: "🇦🇪" },
    { name: "الكويت", flag: "🇰🇼" },
    { name: "البحرين", flag: "🇧🇭" },
    { name: "عمان", flag: "🇴🇲" },
  ];

  const otherNationalities = [
    { name: "مصر", flag: "🇪🇬" },
    { name: "الأردن", flag: "🇯🇴" },
    { name: "لبنان", flag: "🇱🇧" },
    { name: "سوريا", flag: "🇸🇾" },
    { name: "العراق", flag: "🇮🇶" },
    { name: "اليمن", flag: "🇾🇪" },
    { name: "المغرب", flag: "🇲🇦" },
    { name: "الجزائر", flag: "🇩🇿" },
    { name: "تونس", flag: "🇹🇳" },
    { name: "ليبيا", flag: "🇱🇾" },
    { name: "السودان", flag: "🇸🇩" },
    { name: "فلسطين", flag: "🇵🇸" },
    { name: "باكستان", flag: "🇵🇰" },
    { name: "الهند", flag: "🇮🇳" },
    { name: "بنغلاديش", flag: "🇧🇩" },
    { name: "الفلبين", flag: "🇵🇭" },
    { name: "إندونيسيا", flag: "🇮🇩" },
    { name: "نيبال", flag: "🇳🇵" },
    { name: "أمريكا", flag: "🇺🇸" },
    { name: "بريطانيا", flag: "🇬🇧" },
    { name: "فرنسا", flag: "🇫🇷" },
    { name: "ألمانيا", flag: "🇩🇪" },
    { name: "إيطاليا", flag: "🇮🇹" },
    { name: "أسبانيا", flag: "🇪🇸" },
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

    if (!customerName || !customerPhone || !customerNationality) {
      toast({
        title: "خطأ",
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive",
      });
      return;
    }

    // Validate all ticket holders have required info
    const totalTickets = cart.reduce((sum, item) => sum + item.quantity, 0);
    // We expect (totalTickets - 1) ticket holders since customer is the first ticket
    if (ticketHolders.length !== totalTickets - 1) {
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
      // Validate ticket availability before processing
      for (const cartItem of cart) {
        const ticket = tickets.find(t => t.id === cartItem.ticketId);
        if (ticket) {
          const remainingTickets = ticket.available_quantity - ticket.sold_quantity;
          if (cartItem.quantity > remainingTickets) {
            toast({
              title: "خطأ",
              description: `عدد تذاكر ${getTicketTypeName(ticket.type)} المطلوب (${cartItem.quantity}) يتجاوز المتاح (${remainingTickets})`,
              variant: "destructive",
            });
            setProcessing(false);
            return;
          }
        }
      }

      // Create customer
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .insert({
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          nationality: customerNationality,
          id_number: customerIdNumber,
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
          n8n_response_message: "طلب من نقطة البيع - POS",
          n8n_responded_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create ticket holders with QR codes
      // First ticket holder is the customer
      const allHoldersData = [
        {
          name: customerName,
          nationality: customerNationality,
          idNumber: customerIdNumber,
          phone: customerPhone,
          countryCode: customerCountryCode,
          ticketType: cart[0].ticketType
        },
        ...ticketHolders
      ];

      // Prepare holders with ticket references (QR codes will be generated in background)
      const holdersToInsert = allHoldersData.map((holder, index) => {
        const ticketRef = `${bookingRef}-TKT${(index + 1).toString().padStart(2, '0')}`;
        return {
          order_id: orderData.id,
          name: holder.name,
          phone: holder.phone || customerPhone,
          country_code: holder.countryCode || customerCountryCode,
          nationality: holder.nationality,
          ticket_type: holder.ticketType,
          qr_code: ticketRef, // Use ticket reference initially, QR will be generated in background
          id_number: holder.idNumber,
          is_present: true
        };
      });

      const { data: insertedHolders, error: holdersError } = await supabase
        .from("ticket_holders")
        .insert(holdersToInsert)
        .select('id, qr_code');

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

      // POS orders don't need QR codes - ticket reference is sufficient

      // Prepare success data for dialog
      const ticketTypeSummary = cart.map(item => ({
        type: getTicketTypeName(item.ticketType),
        quantity: item.quantity
      }));

      const allHoldersSummary = [
        { name: customerName, ticketType: getTicketTypeName(cart[0].ticketType) },
        ...ticketHolders.map(h => ({ name: h.name, ticketType: getTicketTypeName(h.ticketType) }))
      ];

      setSuccessData({
        totalTickets: cart.reduce((sum, item) => sum + item.quantity, 0),
        mainName: customerName,
        ticketHolders: allHoldersSummary,
        ticketTypes: ticketTypeSummary
      });
      setShowSuccessDialog(true);

      // Log activity
      await logActivity({
        activityType: 'pos_form',
        userType: 'admin',
        userIdentifier: customerPhone,
        actionData: {
          booking_reference: bookingRef,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          customer_nationality: customerNationality,
          customer_id_number: customerIdNumber,
          total_amount: totalAmount,
          ticket_count: cart.reduce((sum, item) => sum + item.quantity, 0),
          cart_items: cart.map(item => ({
            ticket_type: item.ticketType,
            quantity: item.quantity,
            price: item.price
          })),
          ticket_holders: allHoldersData.map(h => ({
            name: h.name,
            nationality: h.nationality,
            id_number: h.idNumber
          }))
        }
      });

      // Reset form
      setCart([]);
      setTicketHolders([]);
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setCustomerNationality("قطر");
      setCustomerIdNumber("");
      setShowAllNationalities(false);
      
      // Refresh tickets if we have an event ID
      if (currentEventId) {
        fetchTicketsForEvent(currentEventId);
      }
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
        <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
            <button onClick={() => navigate("/")} className="focus:outline-none hover:opacity-80 transition-opacity">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-10 sm:h-12 object-contain" />
              ) : (
                <h1 className="text-xl sm:text-2xl font-bold">نقاط البيع</h1>
              )}
            </button>
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex items-center gap-2 px-2 sm:px-4 py-2 h-auto text-sm sm:text-base">
                    <CalendarIcon className="h-4 w-4" />
                    <span className="font-semibold">
                      {selectedDate ? format(selectedDate, "PPP") : "اختر التاريخ"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <h2 className="text-base sm:text-xl font-semibold bg-yellow-400 px-3 sm:px-4 py-2 rounded">بيع تذكرة</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                title={isFullscreen ? "تصغير الشاشة" : "ملء الشاشة"}
                className="hidden sm:flex"
              >
                {isFullscreen ? (
                  <Minimize className="w-5 h-5" />
                ) : (
                  <Maximize className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full mx-auto py-4 sm:py-8 px-2 sm:px-4 lg:px-6 max-w-7xl">{loading ? (
          <div className="text-center py-12">جاري التحميل...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:gap-6">
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
                      <div key={item.ticketId} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 border rounded-lg gap-3">
                        <div className="flex-1">
                          <h4 className="font-bold text-base sm:text-lg">{getTicketTypeName(item.ticketType)}</h4>
                          <p className="text-sm text-muted-foreground">{item.price} ريال × {item.quantity}</p>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
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
                          <span className="font-bold min-w-[70px] sm:min-w-[80px] text-right">{item.price * item.quantity} ريال</span>
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

              {cart.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>معلومات العميل (التذكرة الرئيسية)</CardTitle>
                    <p className="text-sm text-muted-foreground mt-2">
                      هذه المعلومات ستُستخدم للتذكرة الأولى وللتواصل مع العميل
                    </p>
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

                  <div className="hidden">
                    <Label htmlFor="email">البريد الإلكتروني</Label>
                    <Input
                      id="email"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone">رقم الهاتف *</Label>
                    <div className="flex gap-2" dir="ltr">
                      <Input
                        id="phone"
                        type="tel"
                        className="flex-1"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="XXXXXXXX"
                        required
                      />
                      <Select
                        value={customerCountryCode}
                        onValueChange={setCustomerCountryCode}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {countryCodes.map((country) => (
                            <SelectItem key={country.code} value={country.code}>
                              {country.flag} {country.country} {country.code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="id_number">رقم الهوية *</Label>
                    <Input
                      id="id_number"
                      value={customerIdNumber}
                      onChange={(e) => setCustomerIdNumber(e.target.value)}
                      placeholder="رقم الهوية"
                      required
                    />
                  </div>

                  <div>
                    <Label className="mb-3 block">الجنسية *</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                      {displayedNationalities.map((nationality) => (
                        <Button
                          key={nationality.name}
                          type="button"
                          variant={customerNationality === nationality.name ? "default" : "outline"}
                          className="h-12 sm:h-14 text-sm sm:text-base flex items-center justify-center gap-1 sm:gap-2"
                          onClick={() => setCustomerNationality(nationality.name)}
                        >
                          {nationality.flag && <span className="text-xl sm:text-2xl">{nationality.flag}</span>}
                          <span className="truncate">{nationality.name}</span>
                        </Button>
                      ))}
                    </div>
                    
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full mt-3 text-sm sm:text-base"
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
              )}

              {/* Ticket Holders Details */}
              {ticketHolders.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      معلومات حاملي التذاكر الإضافية ({ticketHolders.length} {ticketHolders.length === 1 ? 'تذكرة' : 'تذاكر'})
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-2">
                      التذكرة الأولى مخصصة للعميل أعلاه. املأ معلومات حاملي التذاكر الإضافية هنا.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {ticketHolders.map((holder, index) => (
                      <div key={index} className="p-4 border rounded-lg space-y-3 bg-muted/50">
                        <div className="flex justify-between items-center">
                          <div>
                            <h4 className="font-bold text-primary">
                              التذكرة الإضافية #{index + 1} - {getTicketTypeName(holder.ticketType)}
                            </h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              السعر: {tickets.find(t => t.type === holder.ticketType)?.price.toFixed(2) || '0.00'} {t("qar")}
                            </p>
                          </div>
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                            <Label htmlFor={`holder-phone-${index}`}>رقم الهاتف</Label>
                            <div className="flex gap-2" dir="ltr">
                              <Input
                                id={`holder-phone-${index}`}
                                type="tel"
                                className="flex-1"
                                value={holder.phone}
                                onChange={(e) => updateTicketHolder(index, 'phone', e.target.value)}
                                placeholder="XXXXXXXX"
                              />
                              <Select
                                value={holder.countryCode}
                                onValueChange={(value) => updateTicketHolder(index, 'countryCode', value)}
                              >
                                <SelectTrigger className="w-[140px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {countryCodes.map((country) => (
                                    <SelectItem key={country.code} value={country.code}>
                                      {country.flag} {country.country} {country.code}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
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

              <Button
                type="submit" 
                size="lg" 
                disabled={processing || cart.length === 0} 
                className="w-full h-12 sm:h-14 text-base sm:text-lg flex items-center justify-center gap-2"
              >
                {processing ? "جاري المعالجة..." : "إتمام الشراء وإرسال الفاتورة"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md text-center p-8">
          <div className="flex flex-col items-center gap-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-green-600">تم بنجاح!</h2>
              <p className="text-muted-foreground">تم إنشاء الطلب بنجاح</p>
            </div>

            {successData && (
              <div className="w-full space-y-4 text-right bg-muted/50 rounded-lg p-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="text-2xl font-bold text-primary">{successData.totalTickets}</span>
                  <span className="font-medium">عدد التذاكر</span>
                </div>
                
                <div className="space-y-2">
                  <p className="font-medium text-sm text-muted-foreground">أنواع التذاكر:</p>
                  {successData.ticketTypes.map((tt, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="font-semibold">{tt.quantity}x</span>
                      <span>{tt.type}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 border-t pt-2">
                  <p className="font-medium text-sm text-muted-foreground">حاملي التذاكر:</p>
                  {successData.ticketHolders.map((holder, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-xs text-muted-foreground">({holder.ticketType})</span>
                      <span className="font-medium">{idx === 0 ? `👤 ${holder.name}` : holder.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button 
              onClick={() => setShowSuccessDialog(false)} 
              size="lg" 
              className="w-full h-12 text-lg"
            >
              حسناً
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPOS;

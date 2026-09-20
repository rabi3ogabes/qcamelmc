import { useState, useEffect, useRef } from "react";
import { CustomerLookup, type LookupCustomer } from "@/components/admin/CustomerLookup";
import { searchCustomers, dedupeCustomers } from "@/lib/customerLookup";
import { getPersonEventHistory, formatHistoryDate, PersonEventHistoryItem } from "@/lib/personEventHistory";


import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ShoppingCart, Trash2, Plus, Minus, Maximize, Minimize, CalendarIcon, CheckCircle2, User, Crown, Ticket, Car, X, UserCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { TicketAddItem } from "@/components/admin/TicketAddItem";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
const formatQatarDate = (value: string | Date) =>
  formatInTimeZone(new Date(value), "Asia/Qatar", "PPP");
import { canPurchaseTickets } from "@/lib/eventUtils";
import { useActivityLog } from "@/hooks/useActivityLog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FireworksBurst } from "@/components/FireworksBurst";
import { bookingGuardMessage, checkTicketLimits, formatLimitViolation, isTicketLimitError, ticketLimitErrorMessage } from "@/lib/ticketLimit";
import { useReserveTickets } from "@/hooks/useReserveTickets";
import { CapacityAlert } from "@/components/admin/CapacityAlert";
import { CapacityNotificationBanner } from "@/components/admin/CapacityNotificationBanner";
import { ManualCheckInDialog } from "@/components/admin/ManualCheckInDialog";
import { useCapacityNotification } from "@/hooks/useCapacityNotification";

interface POSUser {
  id: string;
  name: string;
  is_active: boolean;
  icon: string;
}

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
  const { reserveMultipleTickets } = useReserveTickets();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [holderCounts, setHolderCounts] = useState<Record<string, number>>({}); // Actual counts from ticket_holders
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerCountryCode, setCustomerCountryCode] = useState("+974");
  const [customerNationality, setCustomerNationality] = useState("قطر");
  const [customerIdNumber, setCustomerIdNumber] = useState("");
  const [showAllNationalities, setShowAllNationalities] = useState(false);
  const [phoneMatches, setPhoneMatches] = useState<LookupCustomer[]>([]);
  const [phoneHistories, setPhoneHistories] = useState<Record<string, PersonEventHistoryItem[]>>({});
  const [phoneSearching, setPhoneSearching] = useState(false);

  const suppressPhoneSearchRef = useRef(false);

  const [ticketHolders, setTicketHolders] = useState<TicketHolderInput[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [availableEvents, setAvailableEvents] = useState<{ id: string; title: string; event_date: string }[]>([]);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [fireworksTrigger, setFireworksTrigger] = useState(0);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  
  // Capacity notification hook
  const { notification, showNotification, dismissNotification } = useCapacityNotification(currentEventId);
  
  // POS User selection
  const [posUsers, setPosUsers] = useState<POSUser[]>([]);
  const [selectedPosUserId, setSelectedPosUserId] = useState<string | null>(() => {
    // Load from localStorage on init
    return localStorage.getItem("pos_user_id");
  });
  const [selectedPosUserName, setSelectedPosUserName] = useState<string>("");

  // Fetch POS users
  useEffect(() => {
    const fetchPosUsers = async () => {
      const { data, error } = await supabase
        .from("pos_users")
        .select("id, name, is_active, icon")
        .eq("is_active", true)
        .order("name");
      
      if (error) {
        console.error("Error fetching POS users:", error);
        return;
      }
      
      setPosUsers(data || []);
      
      // Set current user name if we have a saved ID
      const savedId = localStorage.getItem("pos_user_id");
      if (savedId && data) {
        const user = data.find(u => u.id === savedId);
        if (user) {
          setSelectedPosUserName(user.name);
        } else {
          // User no longer active/exists, clear selection
          localStorage.removeItem("pos_user_id");
          setSelectedPosUserId(null);
        }
      }
    };
    
    fetchPosUsers();
  }, []);

  const handlePosUserChange = (userId: string) => {
    setSelectedPosUserId(userId);
    localStorage.setItem("pos_user_id", userId);
    const user = posUsers.find(u => u.id === userId);
    setSelectedPosUserName(user?.name || "");
    toast({
      title: "تم",
      description: `تم اختيار المستخدم: ${user?.name}`,
    });
  };

  useEffect(() => {
    // Fetch every event that still allows ticket sales
    const fetchUpcomingEvent = async () => {
      try {
        const { data, error } = await supabase
          .from("events")
          .select("id, title, event_date")
          .eq("is_active", true)
          .eq("is_archived", false)
          .order("event_date", { ascending: true });

        if (error) {
          console.error("Error fetching upcoming event:", error);
          throw error;
        }

        const sellable = (data || []).filter(event => canPurchaseTickets(event.event_date));
        setAvailableEvents(sellable);

        const availableEvent = sellable[0];

        if (availableEvent) {
          setSelectedDate(new Date(availableEvent.event_date));
          setCurrentEventId(availableEvent.id);
          fetchTicketsForEvent(availableEvent.id);
        }
      } catch (error) {
        console.error("Failed to fetch upcoming event:", error);
      }
    };

    fetchUpcomingEvent();
    fetchSettings();
  }, []);

  const handleEventChange = async (eventId: string) => {
    const event = availableEvents.find(e => e.id === eventId);
    if (!event) return;
    setCurrentEventId(eventId);
    setSelectedDate(new Date(event.event_date));
    setLoading(true);
    try {
      await fetchTicketsForEvent(eventId);
    } finally {
      setLoading(false);
    }
  };


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

    // Also subscribe to ticket_holders changes to update counts in real-time
    const holdersChannel = supabase
      .channel('ticket-holders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_holders',
        },
        () => {
          console.log('Ticket holders changed, refreshing counts...');
          fetchHolderCounts(currentEventId);
        }
      )
      .subscribe();

    // Subscribe to orders changes - important for when payment_status changes to 'confirmed'
    const ordersChannel = supabase
      .channel('orders-realtime-pos')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `event_id=eq.${currentEventId}`
        },
        (payload) => {
          console.log('Order updated, refreshing counts...', payload);
          // Refresh counts when payment status changes
          if (payload.new.payment_status !== payload.old?.payment_status) {
            fetchHolderCounts(currentEventId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(holdersChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, [currentEventId]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Live customer suggestions while typing the phone number
  useEffect(() => {
    const term = customerPhone.replace(/\D/g, "");
    if (suppressPhoneSearchRef.current) {
      suppressPhoneSearchRef.current = false;
      return;
    }
    if (term.length < 4) {
      setPhoneMatches([]);
      setPhoneHistories({});
      return;
    }
    let cancelled = false;
    setPhoneSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = dedupeCustomers(await searchCustomers(term)) as LookupCustomer[];
        if (cancelled) return;
        setPhoneMatches(found);
        if (found.length > 0) {
          const entries = await Promise.all(
            found.map(async (c) => [
              c.id,
              await getPersonEventHistory(c.id_number, `${c.country_code || ""}${c.phone}`),
            ] as const)
          );
          if (!cancelled) setPhoneHistories(Object.fromEntries(entries));
        } else {
          setPhoneHistories({});
        }
      } catch (err) {
        console.error("Phone lookup failed:", err);
        if (!cancelled) {
          setPhoneMatches([]);
          setPhoneHistories({});
        }
      } finally {

        if (!cancelled) setPhoneSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerPhone]);

  const applyCustomer = (c: LookupCustomer) => {
    suppressPhoneSearchRef.current = true;
    setCustomerName(c.name || "");
    setCustomerEmail(c.email || "");
    setCustomerPhone(c.phone || "");
    setCustomerCountryCode(c.country_code || "+974");
    setCustomerNationality(c.nationality || "قطر");
    setCustomerIdNumber(c.id_number || "");
    setPhoneMatches([]);
    setPhoneHistories({});

    toast({ title: "تم", description: `تم تعبئة بيانات ${c.name}` });
  };



  // When a customer is selected, copy their name into any empty attendee
  // name fields so the cashier doesn't have to re-type it for each ticket.

  // Auto-populate name from main customer to ticket holder names.
  // Keeps syncing while the holder name is still empty or still matches the
  // previous auto-filled value (e.g. the first typed letter), so typing the
  // buyer's name updates all attendees live. A manually edited attendee name
  // is never overwritten.
  const prevAutoNameRef = useRef("");
  useEffect(() => {
    const prevAuto = prevAutoNameRef.current.trim();
    setTicketHolders(prev => prev.map(holder => {
      const current = holder.name.trim();
      const wasAutoFilled = current === "" || current === prevAuto;
      return wasAutoFilled ? { ...holder, name: customerName } : holder;
    }));
    prevAutoNameRef.current = customerName;
  }, [customerName]);

  // Auto-populate phone number from main customer to all ticket holders
  useEffect(() => {
    if (customerPhone && ticketHolders.length > 0) {
      setTicketHolders(prev => prev.map(holder => ({
        ...holder,
        phone: customerPhone
      })));
    }
  }, [customerPhone]);

  // Auto-populate country code from main customer to all ticket holders
  useEffect(() => {
    if (customerCountryCode && ticketHolders.length > 0) {
      setTicketHolders(prev => prev.map(holder => ({
        ...holder,
        countryCode: customerCountryCode
      })));
    }
  }, [customerCountryCode]);

  useEffect(() => {
    if (customerIdNumber) {
      setTicketHolders(prev => prev.map(holder => ({
        ...holder,
        idNumber: customerIdNumber
      })));
    }
  }, [customerIdNumber]);

  // Auto-populate nationality from main customer to all ticket holders
  useEffect(() => {
    if (customerNationality && ticketHolders.length > 0) {
      setTicketHolders(prev => prev.map(holder => ({
        ...holder,
        nationality: customerNationality
      })));
    }
  }, [customerNationality]);

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
      .from("public_settings")
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
      
      // Fetch actual holder counts (pending + confirmed)
      await fetchHolderCounts(eventId);
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

  const fetchHolderCounts = async (eventId: string) => {
    try {
      // Only count confirmed tickets for availability (not pending)
      const { data: activeHolders, error } = await supabase
        .from("ticket_holders")
        .select("ticket_type, orders!inner(event_id, payment_status)")
        .eq("orders.event_id", eventId)
        .eq("orders.payment_status", "confirmed");

      if (error) {
        console.error("Error fetching holder counts:", error);
        return;
      }

      const counts: Record<string, number> = {};
      (activeHolders || []).forEach(holder => {
        const type = holder.ticket_type;
        counts[type] = (counts[type] || 0) + 1;
      });
      
      console.log("Fetched holder counts:", counts);
      setHolderCounts(counts);
    } catch (error) {
      console.error("Failed to fetch holder counts:", error);
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
    // Limit VIP + normal tickets to 5 total
    if (ticketType === "vip" || ticketType === "normal") {
      const currentTotal = getTotalVipNormalInCart();
      return (currentTotal + quantity) <= 5;
    }
    return true;
  };

  /**
   * Single source of truth for the attendee forms: the cart decides how many
   * attendees are needed (the buyer always takes the first ticket of the first
   * line), and existing filled-in attendees are preserved whenever possible.
   */
  const reconcileHolders = (
    nextCart: CartItem[],
    existing: TicketHolderInput[]
  ): TicketHolderInput[] => {
    const needed = new Map<string, number>();
    nextCart.forEach((item, index) => {
      const required = index === 0 ? item.quantity - 1 : item.quantity;
      needed.set(item.ticketType, (needed.get(item.ticketType) || 0) + Math.max(0, required));
    });

    const kept: TicketHolderInput[] = [];
    const used = new Map<string, number>();
    for (const holder of existing) {
      const limit = needed.get(holder.ticketType) || 0;
      const count = used.get(holder.ticketType) || 0;
      if (count < limit) {
        kept.push(holder);
        used.set(holder.ticketType, count + 1);
      }
    }

    needed.forEach((limit, ticketType) => {
      let count = used.get(ticketType) || 0;
      while (count < limit) {
        kept.push({
          name: customerName || "",
          nationality: customerNationality || "قطر",
          idNumber: customerIdNumber || "",
          phone: customerPhone,
          countryCode: customerCountryCode,
          ticketType,
        });
        count += 1;
      }
    });

    return kept;
  };

  /** Applies a new cart and keeps the attendee forms perfectly in sync with it. */
  const applyCart = (nextCart: CartItem[]) => {
    setCart(nextCart);
    setTicketHolders(prev => reconcileHolders(nextCart, prev));
  };

  const addToCart = (ticket: Ticket, quantity: number) => {
    console.log("addToCart called with:", { ticket, quantity });
    console.log("Current cart:", cart);
    
    // Check if adding would exceed maximum available tickets - use actual holder counts
    const soldCount = holderCounts[ticket.type] || 0;
    const remainingTickets = ticket.available_quantity - soldCount;
    const existingItem = cart.find(item => item.ticketId === ticket.id);
    const currentInCart = existingItem ? existingItem.quantity : 0;
    
    if (currentInCart + quantity > remainingTickets) {
      toast({
        title: "خطأ",
        description: `لا يمكن إضافة هذا العدد. المتبقي: ${Math.max(0, remainingTickets - currentInCart)} تذاكر فقط`,
        variant: "destructive",
      });
      return;
    }
    
    // Limit VIP + normal tickets to 5 total
    if ((ticket.type === "vip" || ticket.type === "normal") && !canAddToCart(ticket.type, quantity)) {
      toast({
        title: "خطأ",
        description: "الحد الأقصى لتذاكر VIP والعادي معاً هو 5",
        variant: "destructive",
      });
      return;
    }

    const nextCart = existingItem
      ? cart.map(item =>
          item.ticketId === ticket.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      : [...cart, {
          ticketId: ticket.id,
          ticketType: ticket.type,
          quantity: quantity,
          price: ticket.price,
          eventId: ticket.event_id,
        }];

    applyCart(nextCart);

    toast({
      title: "تمت الإضافة",
      description: `تم إضافة ${quantity} ${getTicketTypeName(ticket.type)} للسلة`,
    });
  };

  const cartTypeMeta: Record<string, { icon: typeof Crown; colorVar: string }> = {
    vip: { icon: Crown, colorVar: "--ticket-vip" },
    normal: { icon: Ticket, colorVar: "--ticket-normal" },
    parking: { icon: Car, colorVar: "--ticket-parking" },
  };

  const removeFromCart = (ticketId: string) => {
    const item = cart.find((item) => item.ticketId === ticketId);
    if (!item) return;

    applyCart(cart.filter(cartItem => cartItem.ticketId !== ticketId));
  };

  /** Removes a single ticket unit from a cart line (used by the per-ticket icons). */
  const removeOneFromCart = (ticketId: string) => {
    const item = cart.find((i) => i.ticketId === ticketId);
    if (!item) return;
    updateCartItemQuantity(ticketId, item.quantity - 1);
  };

  const updateCartItemQuantity = (ticketId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      removeFromCart(ticketId);
      return;
    }

    const item = cart.find(i => i.ticketId === ticketId);
    if (!item) return;

    // Check if new quantity exceeds maximum available - use actual holder counts
    const ticket = tickets.find(t => t.id === ticketId);
    if (ticket) {
      const soldCount = holderCounts[ticket.type] || 0;
      const remainingTickets = ticket.available_quantity - soldCount;
      if (newQuantity > remainingTickets) {
        toast({
          title: "خطأ",
          description: `لا يمكن تجاوز الحد الأقصى. المتبقي: ${Math.max(0, remainingTickets)} تذاكر`,
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

    applyCart(cart.map(cartItem =>
      cartItem.ticketId === ticketId
        ? { ...cartItem, quantity: newQuantity }
        : cartItem
    ));
  };

  const updateTicketHolder = (index: number, field: keyof TicketHolderInput, value: string) => {
    const updated = [...ticketHolders];
    updated[index] = { ...updated[index], [field]: value };
    
    // If phone, countryCode or nationality changed, sync to all other ticket holders AND main customer
    if (field === 'phone' || field === 'countryCode' || field === 'nationality') {
      const synced = updated.map(holder => ({
        ...holder,
        [field]: value
      }));
      setTicketHolders(synced);
      
      // Also sync back to main customer form
      if (field === 'countryCode') {
        setCustomerCountryCode(value);
      } else if (field === 'phone') {
        setCustomerPhone(value);
      } else if (field === 'nationality') {
        setCustomerNationality(value);
      }
    } else {
      setTicketHolders(updated);
    }
  };

  const deleteTicketHolder = (index: number) => {
    const holder = ticketHolders[index];
    if (!holder) return;

    const remainingHolders = ticketHolders.filter((_, i) => i !== index);

    // Decrease the matching cart line, then rebuild the attendee list from it
    const cartItem = cart.find(item => item.ticketType === holder.ticketType);
    const nextCart = cartItem
      ? cart
          .map(item =>
            item.ticketId === cartItem.ticketId
              ? { ...item, quantity: item.quantity - 1 }
              : item
          )
          .filter(item => item.quantity > 0)
      : cart;

    setCart(nextCart);
    setTicketHolders(reconcileHolders(nextCart, remainingHolders));

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
      // Use atomic reservation check to prevent race conditions
      if (!currentEventId) {
        toast({
          title: "خطأ",
          description: "لم يتم تحديد الفعالية",
          variant: "destructive",
        });
        setProcessing(false);
        return;
      }

      // Enforce the 5-ticket-per-person rule before creating anything
      const limitHolders = [
        {
          name: customerName,
          idNumber: customerIdNumber,
          phone: customerPhone,
          ticketType: cart[0].ticketType,
        },
        ...ticketHolders.map(h => ({
          name: h.name,
          idNumber: h.idNumber,
          phone: h.phone || customerPhone,
          ticketType: h.ticketType,
        })),
      ];
      const limitViolations = await checkTicketLimits(limitHolders, currentEventId);
      if (limitViolations.length > 0) {
        toast({
          title: "تجاوز الحد الأقصى للتذاكر",
          description: limitViolations.map(formatLimitViolation).join(" — "),
          variant: "destructive",
        });
        setProcessing(false);
        return;
      }

      const ticketSelections = cart.map(item => ({
        type: item.ticketType,
        quantity: item.quantity
      }));

      const reservationResult = await reserveMultipleTickets(currentEventId, ticketSelections);
      
      if (!reservationResult.success) {
        const result = reservationResult.result;
        const failedType = reservationResult.failedType;
        
        toast({
          title: "خطأ - عدد التذاكر المطلوبة غير متاح",
          description: `${getTicketTypeName(failedType || '')}: ${result?.message || 'غير متوفر'}`,
          variant: "destructive",
        });
        
        // Refresh holder counts
        await fetchHolderCounts(currentEventId);
        setProcessing(false);
        return;
      }


      // The whole sale (customer + order + every ticket) is saved in ONE database
      // operation: if any ticket is refused, nothing at all is recorded.
      const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const eventDatePart = selectedDate
        ? selectedDate.toLocaleDateString("en-GB", { day: "numeric", month: "numeric", year: "numeric" }).replace(/\//g, "-")
        : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "numeric", year: "numeric" }).replace(/\//g, "-");
      const bookingRef = `POS-${eventDatePart}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

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

      const { error: bookingError } = await supabase.rpc("create_pos_booking", {
        p_customer: {
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          country_code: customerCountryCode,
          nationality: customerNationality,
          id_number: customerIdNumber,
        },
        p_event_id: cart[0].eventId,
        p_total_amount: totalAmount,
        p_booking_reference: bookingRef,
        p_holders: allHoldersData.map(holder => ({
          name: holder.name,
          phone: holder.phone || customerPhone,
          country_code: holder.countryCode || customerCountryCode,
          nationality: holder.nationality,
          ticket_type: holder.ticketType,
          id_number: holder.idNumber,
        })),
        p_pos_user_id: selectedPosUserId,
      });

      if (bookingError) throw bookingError;

      // Notify the admin by email about this sale (never blocks the sale)
      supabase.functions
        .invoke("notify-admin-sale", { body: { booking_reference: bookingRef } })
        .catch((e) => console.error("admin sale alert failed:", e));

      // Sold quantities are maintained automatically by database triggers.


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
      setFireworksTrigger(t => t + 1);
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
        title: isTicketLimitError(error) ? "تجاوز الحد الأقصى للتذاكر" : "خطأ",
        description: isTicketLimitError(error)
          ? ticketLimitErrorMessage(error)
          : bookingGuardMessage(error) || "فشل إنشاء الطلبات",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-lusail" dir="rtl">
      {/* Capacity Notification Banner */}
      {showNotification && notification && (
        <CapacityNotificationBanner
          ticketType={notification.ticketType}
          increase={notification.increase}
          newCapacity={notification.newCapacity}
          onDismiss={dismissNotification}
        />
      )}
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
              {/* POS User Selector */}
              <Select value={selectedPosUserId || ""} onValueChange={handlePosUserChange}>
                <SelectTrigger className="w-[160px] sm:w-[200px] bg-primary/10 border-primary">
                  {selectedPosUserId ? (
                    <span className="flex items-center gap-2">
                      <span className="text-lg">{posUsers.find(u => u.id === selectedPosUserId)?.icon || "⭐"}</span>
                      <span>{selectedPosUserName}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span>اختر المستخدم</span>
                    </span>
                  )}
                </SelectTrigger>
                <SelectContent>
                  {posUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <span className="flex items-center gap-2">
                        <span className="text-lg">{user.icon || "⭐"}</span>
                        <span>{user.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {availableEvents.length > 1 ? (
                <Select value={currentEventId || undefined} onValueChange={handleEventChange}>
                  <SelectTrigger className="w-auto min-w-[200px] max-w-[320px] gap-2 h-auto py-2 text-sm sm:text-base font-semibold">
                    <CalendarIcon className="h-4 w-4 shrink-0" />
                    <SelectValue placeholder="اختر الفعالية" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEvents.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        <span className="flex flex-col items-start">
                          <span className="font-semibold">{event.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatQatarDate(event.event_date)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Button variant="outline" className="flex items-center gap-2 px-2 sm:px-4 py-2 h-auto text-sm sm:text-base cursor-not-allowed opacity-70" disabled>
                  <CalendarIcon className="h-4 w-4" />
                  <span className="font-semibold">
                    {selectedDate ? formatQatarDate(selectedDate) : "اختر التاريخ"}
                  </span>
                </Button>
              )}
              <h2 className="text-base sm:text-xl font-semibold bg-yellow-400 px-3 sm:px-4 py-2 rounded">بيع تذكرة</h2>
              <Button
                type="button"
                onClick={() => setCheckInOpen(true)}
                className="h-auto px-3 sm:px-4 py-2 gap-2 font-semibold shadow-elegant bg-gradient-to-l from-primary to-primary/80"
              >
                <UserCheck className="w-4 h-4" />
                تسجيل الحضور
              </Button>
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

      <ManualCheckInDialog
        open={checkInOpen}
        onOpenChange={setCheckInOpen}
        staffName={selectedPosUserName || null}
      />


      <div className="w-full mx-auto py-4 sm:py-8 px-2 sm:px-4 lg:px-6 max-w-7xl">
        {/* Capacity Alert */}
        {currentEventId && <CapacityAlert eventId={currentEventId} />}
        
        {loading ? (
          <div className="text-center py-12">جاري التحميل...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div className="grid gap-4 sm:gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    إضافة التذاكر
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {tickets.map((ticket) => (
                      <TicketAddItem
                        key={ticket.id}
                        ticket={ticket}
                        onAddToCart={addToCart}
                        getTicketTypeName={getTicketTypeName}
                        actualSoldCount={holderCounts[ticket.type]}
                      />
                    ))}
                  </div>

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
                    <CardTitle>معلومات العميل (التذكرة الرئيسية)</CardTitle>
                    <p className="text-sm text-muted-foreground mt-2">
                      هذه المعلومات ستُستخدم للتذكرة الأولى وللتواصل مع العميل
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                  <div className="rounded-lg border border-dashed p-3 bg-muted/30">
                    <Label className="mb-2 block">استدعاء عميل سابق</Label>
                    <CustomerLookup
                      eventId={currentEventId}
                      onSelect={(c) => {
                        setCustomerName(c.name || "");
                        setCustomerEmail(c.email || "");
                        setCustomerPhone(c.phone || "");
                        setCustomerCountryCode(c.country_code || "+974");
                        setCustomerNationality(c.nationality || "قطر");
                        setCustomerIdNumber(c.id_number || "");
                      }}
                    />
                  </div>
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
                        dir="rtl"
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

                    {(phoneSearching || phoneMatches.length > 0) && (
                      <div className="mt-2 rounded-xl border border-primary/30 bg-card shadow-lg overflow-hidden" dir="rtl">
                        {phoneSearching && phoneMatches.length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">جاري البحث عن عملاء سابقين…</p>
                        )}
                        {phoneMatches.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => applyCustomer(c)}
                            className="w-full text-right px-3 py-2 flex items-center justify-between gap-3 hover:bg-primary/10 transition-colors border-b last:border-b-0 border-border/50"
                          >
                            <span className="min-w-0">
                              <span className="block font-bold truncate">{c.name}</span>
                              <span className="block text-[11px] text-muted-foreground" dir="ltr">
                                {c.country_code || "+974"}{c.phone}
                                {c.id_number ? ` · ${c.id_number}` : ""}
                                {c.nationality ? ` · ${c.nationality}` : ""}
                              </span>
                              {phoneHistories[c.id]?.length > 0 && (
                                <span className="mt-1.5 flex flex-wrap gap-1">
                                  {phoneHistories[c.id].map((h) => (
                                    <span
                                      key={h.eventId}
                                      title={h.title}
                                      className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] text-foreground/80"
                                    >
                                      <span className="opacity-70">{formatHistoryDate(h.date) || h.title}</span>
                                      <span className="font-bold text-primary">{h.count} تذكرة</span>
                                    </span>
                                  ))}
                                </span>
                              )}
                            </span>

                            <User className="w-4 h-4 text-primary shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
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
                                dir="rtl"
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
                              <SelectTrigger id={`holder-nationality-${index}`} dir="rtl">
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

              {/* ===== السلة الجانبية الثابتة ===== */}
              <aside className="lg:sticky lg:top-24">
                <Card className="overflow-hidden border-primary/15 shadow-elegant">
                  <CardHeader className="bg-muted/40 border-b border-border/60 py-4">
                    <CardTitle className="flex items-center justify-between text-lg">
                      <span className="flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5 text-primary" />
                        السلة
                      </span>
                      <span className="text-sm font-semibold text-muted-foreground">
                        {cart.reduce((sum, item) => sum + item.quantity, 0)} تذكرة
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {cart.length === 0 ? (
                      <div className="py-10 text-center text-muted-foreground">
                        <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">السلة فارغة</p>
                        <p className="text-xs mt-1 opacity-70">أضف تذاكر من الأعلى لتظهر هنا</p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {cart.map((item) => {
                          const meta = cartTypeMeta[item.ticketType] || cartTypeMeta.normal;
                          const Icon = meta.icon;
                          const color = `hsl(var(${meta.colorVar}))`;
                          return (
                            <div key={item.ticketId} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-sm font-bold">
                                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                                  {getTicketTypeName(item.ticketType)}
                                </span>
                                <span className="text-xs text-muted-foreground" dir="ltr">
                                  {item.quantity} × {item.price} ريال
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {Array.from({ length: item.quantity }).map((_, idx) => (
                                  <button
                                    key={`${item.ticketId}-${idx}`}
                                    type="button"
                                    onClick={() => removeOneFromCart(item.ticketId)}
                                    title="حذف هذه التذكرة"
                                    aria-label={`حذف تذكرة ${getTicketTypeName(item.ticketType)} رقم ${idx + 1}`}
                                    className="group relative flex h-12 w-12 items-center justify-center rounded-xl border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-destructive/50"
                                    style={{ borderColor: `hsl(var(${meta.colorVar}) / 0.45)` }}
                                  >
                                    <Icon className="h-5 w-5" style={{ color }} />
                                    <span className="absolute -top-1.5 -left-1.5 flex h-4.5 w-4.5 h-[18px] w-[18px] items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                      <X className="h-3 w-3" />
                                    </span>
                                    <span className="absolute bottom-0.5 left-1 text-[9px] font-bold text-muted-foreground" dir="ltr">
                                      {idx + 1}
                                    </span>
                                  </button>
                                ))}
                              </div>
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>المجموع</span>
                                <span className="font-bold text-foreground">{item.price * item.quantity} ريال</span>
                              </div>
                            </div>
                          );
                        })}

                        <div className="rounded-xl bg-primary/5 border border-primary/15 p-3">
                          <div className="flex justify-between items-center">
                            <span className="font-bold">الإجمالي الكلي</span>
                            <span className="text-xl font-extrabold text-primary" dir="ltr">{totalAmount} ريال</span>
                          </div>
                          {getTotalVipNormalInCart() > 0 && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              تذاكر VIP والعادي: {getTotalVipNormalInCart()} / 5
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </aside>
            </div>
          </form>
        )}
      </div>

      {/* Success Dialog */}
      {showSuccessDialog && <FireworksBurst trigger={fireworksTrigger} />}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md text-center p-8 border-2 border-primary/30 shadow-[0_0_60px_-10px] shadow-primary/40 overflow-visible">
          <div className="flex flex-col items-center gap-6">
            <div className="relative w-20 h-20 bg-success/15 rounded-full flex items-center justify-center animate-in zoom-in-50 duration-500">
              <span className="absolute inset-0 rounded-full ring-4 ring-success/25 animate-ping" aria-hidden="true" />
              <CheckCircle2 className="w-12 h-12 text-success relative" />
            </div>

            <div className="space-y-2">
              <DialogTitle className="text-2xl font-extrabold text-success tracking-wide animate-in fade-in slide-in-from-top-2 duration-700">تم بنجاح!</DialogTitle>
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

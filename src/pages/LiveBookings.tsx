import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, CheckCircle, XCircle, Users, LayoutGrid, Table as TableIcon, User, Phone, CreditCard, Hash, Maximize, Minimize, Globe, Store, Volume2, VolumeX, Clock, Send, SendHorizonal, CircleDashed } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { Footer } from "@/components/Footer";
import { canPurchaseTickets } from "@/lib/eventUtils";

const QATAR_TIMEZONE = "Asia/Qatar";

// Create audio context for notification sounds
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Pleasant notification tone
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
    oscillator.frequency.setValueAtTime(1108.73, audioContext.currentTime + 0.1); // C#6
    oscillator.frequency.setValueAtTime(1318.51, audioContext.currentTime + 0.2); // E6
    
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.log('Audio not supported:', error);
  }
};

interface TicketHolder {
  id: string;
  name: string;
  phone: string;
  nationality: string;
  ticket_type: string;
  qr_code: string;
  id_number?: string;
  is_present: boolean;
  confirmed_at?: string;
  order_id: string;
  booking_reference?: string;
  payment_method?: string;
  n8n_responded_at?: string | null;
}

interface Booking {
  id: string;
  booking_reference: string;
  payment_status: string;
  payment_method: string;
  ticket_type: string;
  quantity: number;
  total_amount: number;
  created_at: string;
  is_present?: boolean | null;
  customers: {
    name: string;
    email: string;
    phone: string;
    id_number?: string;
    nationality?: string;
  };
  events: {
    title: string;
    event_date: string;
  };
  ticket_holders?: TicketHolder[];
}

const LiveBookings = () => {
  const { t } = useTranslation();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [ticketHolders, setTicketHolders] = useState<TicketHolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [viewType, setViewType] = useState<"cards" | "table">("cards");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newTicketHolderIds, setNewTicketHolderIds] = useState<Set<string>>(new Set());
  const previousTicketHolderIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  const [stats, setStats] = useState({
    total: 0,
    confirmed: 0,
    present: 0,
    totalTickets: 0,
    totalTicketHolders: 0,
    presentTicketHolders: 0,
    lastHourBookings: 0
  });
  const [ticketTypeStats, setTicketTypeStats] = useState<{ [key: string]: { total: number; present: number } }>({});
  const [paymentMethodStats, setPaymentMethodStats] = useState<{ sadad: number; pos: number }>({ sadad: 0, pos: 0 });
  const [paymentMethodByTypeStats, setPaymentMethodByTypeStats] = useState<{
    sadad: { [key: string]: { total: number; present: number } };
    pos: { [key: string]: { total: number; present: number } };
  }>({ sadad: {}, pos: {} });

  const getNationalityFlag = (nationality: string) => {
    const flagMap: { [key: string]: string } = {
      'قطر': '🇶🇦',
      'السعودية': '🇸🇦',
      'الإمارات': '🇦🇪',
      'الكويت': '🇰🇼',
      'البحرين': '🇧🇭',
      'عمان': '🇴🇲',
      'مصر': '🇪🇬',
      'الأردن': '🇯🇴',
      'لبنان': '🇱🇧',
      'سوريا': '🇸🇾',
      'العراق': '🇮🇶',
      'اليمن': '🇾🇪',
      'المغرب': '🇲🇦',
      'الجزائر': '🇩🇿',
      'تونس': '🇹🇳',
      'ليبيا': '🇱🇾',
      'السودان': '🇸🇩',
      'فلسطين': '🇵🇸',
      'باكستان': '🇵🇰',
      'الهند': '🇮🇳',
      'بنغلاديش': '🇧🇩',
      'الفلبين': '🇵🇭',
      'إندونيسيا': '🇮🇩',
      'نيبال': '🇳🇵',
      'أمريكا': '🇺🇸',
      'بريطانيا': '🇬🇧',
      'فرنسا': '🇫🇷',
      'ألمانيا': '🇩🇪',
      'إيطاليا': '🇮🇹',
      'أسبانيا': '🇪🇸',
    };
    return flagMap[nationality] || '🌍';
  };

  // Auto-select upcoming event on page load
  useEffect(() => {
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
        
        // Find the first event that still allows viewing (upcoming or today)
        const availableEvent = data?.find(event => canPurchaseTickets(event.event_date));
        
        if (availableEvent) {
          const eventDate = toZonedTime(new Date(availableEvent.event_date), QATAR_TIMEZONE);
          setSelectedDate(eventDate);
          console.log("Auto-selected upcoming event date:", eventDate);
        } else {
          // Fallback to today if no upcoming events
          const now = new Date();
          setSelectedDate(toZonedTime(now, QATAR_TIMEZONE));
        }
      } catch (error) {
        console.error("Failed to fetch upcoming event:", error);
        // Fallback to today on error
        const now = new Date();
        setSelectedDate(toZonedTime(now, QATAR_TIMEZONE));
      }
    };

    fetchUpcomingEvent();
    fetchSettings();
    const cleanup = setupRealtimeSubscription();
    return cleanup;
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchBookings();
    }
  }, [selectedDate]);


  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("logo_url, header_bg_color")
        .maybeSingle();

      if (error) throw error;
      
      if (data?.logo_url) {
        setLogoUrl(data.logo_url);
      }
      
      if (data?.header_bg_color) {
        setHeaderBgColor(data.header_bg_color);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        toast.error("لا يمكن تفعيل وضع ملء الشاشة");
      });
    } else {
      document.exitFullscreen();
    }
  };

  const fetchBookings = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          customers(name, email, phone, id_number, nationality),
          events(title, event_date),
          ticket_holders(*)
        `)
        .eq("payment_status", "confirmed")
        .order("created_at", { ascending: false });

      if (error) throw error;

      console.log("Raw data from Supabase:", data);
      console.log("First order ticket_holders:", data?.[0]?.ticket_holders);

      // Filter by event date on client side if date is selected
      let filteredData = data || [];
      if (selectedDate) {
        // Extract date components from selected date (ignoring time)
        const selectedYear = selectedDate.getFullYear();
        const selectedMonth = selectedDate.getMonth();
        const selectedDay = selectedDate.getDate();
        
        filteredData = filteredData.filter((order: any) => {
          if (!order.events?.event_date) return false;
          // Convert event date to Qatar timezone
          const eventDate = toZonedTime(new Date(order.events.event_date), QATAR_TIMEZONE);
          // Compare year, month, and day only
          return eventDate.getFullYear() === selectedYear &&
                 eventDate.getMonth() === selectedMonth &&
                 eventDate.getDate() === selectedDay;
        });
      }

      console.log("Filtered data:", filteredData);
      console.log("First filtered order:", filteredData[0]);

      // Extract all ticket holders from filtered bookings
      const allTicketHolders: TicketHolder[] = [];
      filteredData.forEach(order => {
        console.log(`Order ${order.booking_reference} ticket_holders:`, order.ticket_holders);
        if (order.ticket_holders && Array.isArray(order.ticket_holders)) {
          order.ticket_holders.forEach((holder: any) => {
            allTicketHolders.push({
              ...holder,
              booking_reference: order.booking_reference,
              payment_method: order.payment_method,
              n8n_responded_at: order.n8n_responded_at
            });
          });
        }
      });

      console.log("Total ticket holders extracted:", allTicketHolders.length);
      console.log("Ticket holders:", allTicketHolders);

      setBookings(filteredData);
      setTicketHolders(allTicketHolders);
      calculateStats(filteredData, allTicketHolders);
      
      // Track new ticket holders for animation
      if (!isInitialLoadRef.current) {
        const currentIds = new Set(allTicketHolders.map(h => h.id));
        const newIds = new Set<string>();
        currentIds.forEach(id => {
          if (!previousTicketHolderIdsRef.current.has(id)) {
            newIds.add(id);
          }
        });
        if (newIds.size > 0) {
          setNewTicketHolderIds(newIds);
          // Clear animation after 5 seconds
          setTimeout(() => setNewTicketHolderIds(new Set()), 5000);
        }
        previousTicketHolderIdsRef.current = currentIds;
      } else {
        // Store initial IDs
        previousTicketHolderIdsRef.current = new Set(allTicketHolders.map(h => h.id));
        isInitialLoadRef.current = false;
      }
    } catch (error) {
      console.error("Error fetching bookings:", error);
      toast.error(t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    // Subscribe to orders changes
    const ordersChannel = supabase
      .channel('live-bookings-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          console.log('Order update:', payload);
          // Play sound for new confirmed orders
          if (payload.eventType === 'INSERT' && (payload.new as any)?.payment_status === 'confirmed') {
            if (soundEnabled && !isInitialLoadRef.current) {
              playNotificationSound();
              toast.success("🎫 حجز جديد!");
            }
          }
          fetchBookings();
        }
      )
      .subscribe();

    // Subscribe to ticket_holders changes
    const ticketHoldersChannel = supabase
      .channel('live-bookings-ticket-holders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_holders'
        },
        (payload) => {
          console.log('Ticket holder change:', payload);
          fetchBookings();
        }
      )
      .subscribe();

    // Subscribe to tickets changes for availability updates
    const ticketsChannel = supabase
      .channel('live-bookings-tickets')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets'
        },
        (payload) => {
          console.log('Ticket availability update:', payload);
          if (soundEnabled && !isInitialLoadRef.current) {
            playNotificationSound();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(ticketHoldersChannel);
      supabase.removeChannel(ticketsChannel);
    };
  };

  const calculateStats = (bookingsData: Booking[], ticketHoldersData: TicketHolder[]) => {
    const total = bookingsData.length;
    const confirmed = bookingsData.filter(b => b.payment_status === 'confirmed').length;
    const present = bookingsData.filter(b => {
      const holders = b.ticket_holders || [];
      return holders.some((h: any) => h.is_present === true);
    }).length;
    const totalTickets = bookingsData.reduce((sum, b) => sum + b.quantity, 0);
    const totalTicketHolders = ticketHoldersData.length;
    const presentTicketHolders = ticketHoldersData.filter(h => h.is_present).length;

    // Count bookings from the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const lastHourBookings = bookingsData.filter(b => {
      const createdAt = new Date(b.created_at);
      return createdAt >= oneHourAgo;
    }).length;

    // Calculate ticket type breakdown
    const typeBreakdown: { [key: string]: { total: number; present: number } } = {};
    ticketHoldersData.forEach(holder => {
      const type = holder.ticket_type;
      if (!typeBreakdown[type]) {
        typeBreakdown[type] = { total: 0, present: 0 };
      }
      typeBreakdown[type].total += 1;
      if (holder.is_present) {
        typeBreakdown[type].present += 1;
      }
    });

    // Calculate payment method breakdown
    let sadadCount = 0;
    let posCount = 0;
    const paymentByType: {
      sadad: { [key: string]: { total: number; present: number } };
      pos: { [key: string]: { total: number; present: number } };
    } = { sadad: {}, pos: {} };

    bookingsData.forEach(booking => {
      const ticketCount = booking.quantity || 0;
      const paymentKey = booking.payment_method === 'sadad' ? 'sadad' : 'pos';
      
      if (booking.payment_method === 'sadad') {
        sadadCount += ticketCount;
      } else if (booking.payment_method === 'cash_pos') {
        posCount += ticketCount;
      }

      // Get ticket holders for this booking
      const holders = booking.ticket_holders || [];
      holders.forEach((holder: any) => {
        const ticketType = holder.ticket_type;
        if (!paymentByType[paymentKey][ticketType]) {
          paymentByType[paymentKey][ticketType] = { total: 0, present: 0 };
        }
        paymentByType[paymentKey][ticketType].total += 1;
        if (holder.is_present) {
          paymentByType[paymentKey][ticketType].present += 1;
        }
      });
    });

    setStats({ total, confirmed, present, totalTickets, totalTicketHolders, presentTicketHolders, lastHourBookings });
    setTicketTypeStats(typeBreakdown);
    setPaymentMethodStats({ sadad: sadadCount, pos: posCount });
    setPaymentMethodByTypeStats(paymentByType);
  };

  const togglePresence = async (bookingId: string, currentStatus: boolean | null | undefined) => {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ is_present: !currentStatus } as any)
        .eq("id", bookingId);

      if (error) throw error;
      
      toast.success(currentStatus ? t("markedAsAbsent") : t("markedAsPresent"));
      fetchBookings();
    } catch (error) {
      console.error("Error updating presence:", error);
      toast.error(t("failedToLoad"));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-2xl font-lusail">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-lusail flex flex-col" dir="rtl">
      {/* Header with Logo */}
      <header className="border-b backdrop-blur-sm sticky top-0 z-10" style={{ backgroundColor: headerBgColor }}>
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-12 object-contain" />
            ) : (
              <h1 className="text-2xl font-bold">{t("liveBookings")}</h1>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <Button
                variant={viewType === "cards" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewType("cards")}
                className="font-lusail"
              >
                <LayoutGrid className="w-4 h-4 ml-2" />
                عرض البطاقات
              </Button>
              <Button
                variant={viewType === "table" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewType("table")}
                className="font-lusail"
              >
                <TableIcon className="w-4 h-4 ml-2" />
                عرض الجدول
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "إيقاف الصوت" : "تفعيل الصوت"}
            >
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-green-600" />
              ) : (
                <VolumeX className="w-5 h-5 text-muted-foreground" />
              )}
            </Button>
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

      <div className="w-full py-8 px-[5%] flex-1">

        {/* Date Selector and Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <Card className="p-3">
            <div className="flex flex-col gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full justify-start text-right font-lusail text-xs h-8",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="ml-1 h-3 w-3" />
                    {selectedDate ? formatInTimeZone(selectedDate, QATAR_TIMEZONE, "dd/MM") : "تاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {selectedDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDate(undefined)}
                  className="font-lusail text-[10px] h-6 py-0"
                >
                  عرض الكل
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-3 bg-blue-50 dark:bg-blue-950">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">{t("totalBookings")}</p>
                <p className="text-lg font-bold">{stats.total}</p>
              </div>
            </div>
          </Card>

          <Card className="p-3 bg-green-50 dark:bg-green-950">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">{t("confirmedBookings")}</p>
                <p className="text-lg font-bold text-green-600">{stats.confirmed}</p>
              </div>
            </div>
          </Card>

          <Card className="p-3 bg-purple-50 dark:bg-purple-950">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">إجمالي حاملي التذاكر</p>
                <p className="text-lg font-bold text-purple-600">{stats.totalTicketHolders}</p>
              </div>
            </div>
          </Card>

          <Card className="p-3 bg-orange-50 dark:bg-orange-950">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-orange-600 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">الحاضرون (حاملو التذاكر)</p>
                <p className="text-lg font-bold text-orange-600">{stats.presentTicketHolders}</p>
              </div>
            </div>
          </Card>

          <Card className="p-3 bg-cyan-50 dark:bg-cyan-950">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-cyan-600 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">حجوزات آخر ساعة</p>
                <p className="text-lg font-bold text-cyan-600">{stats.lastHourBookings}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Payment Method Breakdown */}
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Online (Sadad) - Left Side */}
            <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <Globe className="w-5 h-5 text-blue-600" />
                  <Badge variant="outline" className="text-sm font-bold bg-blue-500/10">
                    أونلاين
                  </Badge>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-bold text-blue-600">{paymentMethodStats.sadad}</p>
                  <p className="text-sm text-muted-foreground">إجمالي تذاكر سداد</p>
                </div>
                {Object.keys(paymentMethodByTypeStats.sadad).length > 0 && (
                  <div className="pt-3 border-t border-blue-500/20 space-y-2">
                    {Object.entries(paymentMethodByTypeStats.sadad)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([type, stats]) => (
                        <div key={type} className="flex justify-between items-center text-sm">
                          <span className="font-medium">{type}</span>
                          <div className="flex gap-3 items-center">
                            <span className="text-muted-foreground">
                              {stats.total} حجز
                            </span>
                            <span className="text-blue-600 font-bold">
                              {stats.present} حضور
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </Card>
            
            {/* POS - Right Side */}
            <Card className="p-6 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <Store className="w-5 h-5 text-orange-600" />
                  <Badge variant="outline" className="text-sm font-bold bg-orange-500/10">
                    نقاط البيع
                  </Badge>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-bold text-orange-600">{paymentMethodStats.pos}</p>
                  <p className="text-sm text-muted-foreground">إجمالي تذاكر POS</p>
                </div>
                {Object.keys(paymentMethodByTypeStats.pos).length > 0 && (
                  <div className="pt-3 border-t border-orange-500/20 space-y-2">
                    {Object.entries(paymentMethodByTypeStats.pos)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([type, stats]) => (
                        <div key={type} className="flex justify-between items-center text-sm">
                          <span className="font-medium">{type}</span>
                          <div className="flex gap-3 items-center">
                            <span className="text-muted-foreground">
                              {stats.total} حجز
                            </span>
                            <span className="text-orange-600 font-bold">
                              {stats.present} حضور
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Ticket Type Breakdown */}
        {Object.keys(ticketTypeStats).length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4">التذاكر حسب النوع</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Object.entries(ticketTypeStats)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([type, stats]) => (
                  <Card key={type} className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                    <div className="text-center space-y-2">
                      <Badge variant="outline" className="text-xs font-bold">
                        {type.toUpperCase()}
                      </Badge>
                      <div>
                        <p className="text-3xl font-bold text-primary">{stats.total}</p>
                        <p className="text-xs text-muted-foreground">إجمالي التذاكر</p>
                      </div>
                      <div className="pt-2 border-t">
                        <p className="text-2xl font-bold text-green-600">{stats.present}</p>
                        <p className="text-xs text-muted-foreground">حاضر</p>
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        )}

        {/* Ticket Holders Display */}
        {viewType === "cards" ? (
          /* Cards View - Individual Ticket Holders */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {ticketHolders.length === 0 ? (
              <Card className="col-span-full p-12">
                <p className="text-center text-muted-foreground font-lusail">{t("noBookingsForDate")}</p>
              </Card>
            ) : (
              ticketHolders.map((holder) => (
                <Card 
                  key={holder.id} 
                  className={cn(
                    "p-4 hover:shadow-xl transition-shadow shadow-md",
                    newTicketHolderIds.has(holder.id) && "animate-new-booking"
                  )}
                >
                  <div className="flex flex-col gap-3">
                    {/* Name and Flag */}
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="font-semibold text-sm truncate flex-1 min-w-0">{holder.name}</span>
                      <div className="flex flex-col items-center gap-1 flex-shrink-0">
                        {holder.nationality && (
                          <span className="text-lg">{getNationalityFlag(holder.nationality)}</span>
                        )}
                        {/* Invoice/POS Status Icon */}
                        {holder.payment_method === 'cash_pos' ? (
                          <span title="POS"><Store className="w-4 h-4 text-orange-500" /></span>
                        ) : holder.n8n_responded_at ? (
                          <span title="تم إرسال الفاتورة"><Send className="w-4 h-4 text-green-500" /></span>
                        ) : (
                          <span title="لم يتم إرسال الفاتورة"><CircleDashed className="w-4 h-4 text-muted-foreground" /></span>
                        )}
                      </div>
                    </div>

                    {/* Phone */}
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="text-xs truncate">{holder.phone}</span>
                    </div>

                    {/* Booking Reference */}
                    {holder.booking_reference && (
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-xs truncate font-mono">{holder.booking_reference}</span>
                      </div>
                    )}

                    {/* Ticket Type and Attendance */}
                    <div className="flex items-center justify-between gap-2">
                      {/* Ticket Type */}
                      <Badge variant="outline" className="text-xs">
                        {holder.ticket_type.toUpperCase()}
                      </Badge>

                      {/* Attendance */}
                      <div className="flex items-center gap-2">
                        {holder.is_present ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                            <Badge className="bg-green-500 text-xs">
                              حاضر ✓
                            </Badge>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <Badge variant="secondary" className="text-xs">
                              غير حاضر
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Confirmed At */}
                    {holder.confirmed_at && (
                      <div className="text-xs text-muted-foreground text-center">
                        تم التأكيد: {format(new Date(holder.confirmed_at), 'dd/MM/yyyy - HH:mm')}
                      </div>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        ) : (
          /* Table View - Individual Ticket Holders */
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right font-lusail">الاسم</TableHead>
                    <TableHead className="text-right font-lusail">الهاتف</TableHead>
                    <TableHead className="text-right font-lusail">الجنسية</TableHead>
                    <TableHead className="text-right font-lusail">الرقم المرجعي</TableHead>
                    <TableHead className="text-right font-lusail">نوع التذكرة</TableHead>
                    <TableHead className="text-right font-lusail">الحضور</TableHead>
                    <TableHead className="text-right font-lusail">وقت التأكيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ticketHolders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <p className="text-muted-foreground font-lusail">{t("noBookingsForDate")}</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    ticketHolders.map((holder) => (
                      <TableRow 
                        key={holder.id} 
                        className={cn(
                          holder.is_present ? 'bg-green-50 dark:bg-green-950/20' : '',
                          newTicketHolderIds.has(holder.id) && 'animate-new-booking'
                        )}
                      >
                        <TableCell className="font-semibold">{holder.name}</TableCell>
                        <TableCell className="font-mono">{holder.phone}</TableCell>
                        <TableCell>
                          {holder.nationality && (
                            <span>
                              {getNationalityFlag(holder.nationality)} {holder.nationality}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">{holder.booking_reference || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {holder.ticket_type.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {holder.is_present ? (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              <Badge className="bg-green-500">حاضر ✓</Badge>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <XCircle className="w-4 h-4 text-muted-foreground" />
                              <Badge variant="secondary">غير حاضر</Badge>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {holder.confirmed_at 
                            ? format(new Date(holder.confirmed_at), 'dd/MM/yyyy - HH:mm')
                            : '-'
                          }
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default LiveBookings;
import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarIcon, CheckCircle, XCircle, Users, LayoutGrid, Table as TableIcon, User, Phone, CreditCard, Hash, Maximize, Minimize, Globe, Store, Volume2, VolumeX, Clock, Send, SendHorizonal, CircleDashed, BarChart3, Bell, BellOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { Footer } from "@/components/Footer";
import { canPurchaseTickets } from "@/lib/eventUtils";
import { CapacityNotificationBanner } from "@/components/admin/CapacityNotificationBanner";

const QATAR_TIMEZONE = "Asia/Qatar";

interface DailySummary {
  date: string;
  event_title: string;
  vip_count: number;
  vip_amount: number;
  vip_price?: number;
  normal_count: number;
  normal_amount: number;
  normal_price?: number;
  parking_count: number;
  parking_amount: number;
  parking_price?: number;
  daily_total: number;
}

// Create audio context for notification sounds
const playNotificationSound = () => {
  // Generic booking notification sound
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Pleasant notification tone (ascending)
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

// Check-in notification sounds - different for each ticket type
const playCheckinSound = (ticketType: string) => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);
    
    if (ticketType === 'vip') {
      // VIP: Elegant welcome chime - warm, premium feel
      const osc1 = audioContext.createOscillator();
      const osc2 = audioContext.createOscillator();
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
      osc1.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.15); // E5
      osc1.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.3); // G5
      
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1046.5, audioContext.currentTime); // C6 (octave higher)
      osc2.frequency.setValueAtTime(1318.51, audioContext.currentTime + 0.15); // E6
      osc2.frequency.setValueAtTime(1567.98, audioContext.currentTime + 0.3); // G6
      
      gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);
      
      osc1.start(audioContext.currentTime);
      osc2.start(audioContext.currentTime);
      osc1.stop(audioContext.currentTime + 0.6);
      osc2.stop(audioContext.currentTime + 0.6);
      
    } else if (ticketType === 'normal') {
      // Normal: Simple pleasant ding
      const osc1 = audioContext.createOscillator();
      
      osc1.connect(gainNode);
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(698.46, audioContext.currentTime); // F5
      osc1.frequency.setValueAtTime(880, audioContext.currentTime + 0.1); // A5
      
      gainNode.gain.setValueAtTime(0.35, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      
      osc1.start(audioContext.currentTime);
      osc1.stop(audioContext.currentTime + 0.4);
      
    } else if (ticketType === 'parking') {
      // Parking: Short low beep
      const osc1 = audioContext.createOscillator();
      
      osc1.connect(gainNode);
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(349.23, audioContext.currentTime); // F4
      osc1.frequency.setValueAtTime(440, audioContext.currentTime + 0.08); // A4
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      osc1.start(audioContext.currentTime);
      osc1.stop(audioContext.currentTime + 0.3);
      
    } else {
      // Default fallback
      const osc1 = audioContext.createOscillator();
      osc1.connect(gainNode);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, audioContext.currentTime);
      osc1.frequency.setValueAtTime(523.25, audioContext.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      osc1.start(audioContext.currentTime);
      osc1.stop(audioContext.currentTime + 0.3);
    }
  } catch (error) {
    console.log('Audio not supported:', error);
  }
};

// Celebratory sounds for capacity increase - different for each ticket type
const playCapacityIncreaseSound = (ticketType: string) => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);
    
    if (ticketType === 'vip') {
      // VIP: Premium, luxurious fanfare with 3 oscillators - rich harmonics
      const osc1 = audioContext.createOscillator();
      const osc2 = audioContext.createOscillator();
      const osc3 = audioContext.createOscillator();
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      osc3.connect(gainNode);
      
      // Royal fanfare - ascending major 7th chord
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(659.25, audioContext.currentTime); // E5
      osc1.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.12); // G5
      osc1.frequency.setValueAtTime(987.77, audioContext.currentTime + 0.24); // B5
      osc1.frequency.setValueAtTime(1318.51, audioContext.currentTime + 0.36); // E6
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(493.88, audioContext.currentTime); // B4
      osc2.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.12); // E5
      osc2.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.24); // G5
      osc2.frequency.setValueAtTime(987.77, audioContext.currentTime + 0.36); // B5
      
      // Sparkle effect
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(1318.51, audioContext.currentTime); // E6
      osc3.frequency.setValueAtTime(1567.98, audioContext.currentTime + 0.12); // G6
      osc3.frequency.setValueAtTime(1975.53, audioContext.currentTime + 0.24); // B6
      osc3.frequency.setValueAtTime(2637.02, audioContext.currentTime + 0.36); // E7
      
      gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.6, audioContext.currentTime + 0.2);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.0);
      
      osc1.start(audioContext.currentTime);
      osc2.start(audioContext.currentTime);
      osc3.start(audioContext.currentTime);
      osc1.stop(audioContext.currentTime + 1.0);
      osc2.stop(audioContext.currentTime + 1.0);
      osc3.stop(audioContext.currentTime + 1.0);
      
    } else if (ticketType === 'normal') {
      // Normal: Standard celebratory sound - 2 oscillators
      const osc1 = audioContext.createOscillator();
      const osc2 = audioContext.createOscillator();
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
      osc1.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.15); // E5
      osc1.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.3); // G5
      osc1.frequency.setValueAtTime(1046.5, audioContext.currentTime + 0.45); // C6
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(392, audioContext.currentTime); // G4
      osc2.frequency.setValueAtTime(523.25, audioContext.currentTime + 0.15); // C5
      osc2.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.3); // E5
      osc2.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.45); // G5
      
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.6, audioContext.currentTime + 0.3);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);
      
      osc1.start(audioContext.currentTime);
      osc2.start(audioContext.currentTime);
      osc1.stop(audioContext.currentTime + 0.8);
      osc2.stop(audioContext.currentTime + 0.8);
      
    } else if (ticketType === 'parking') {
      // Parking: Simple, lower-pitched notification - single oscillator
      const osc1 = audioContext.createOscillator();
      osc1.connect(gainNode);
      
      osc1.type = 'square';
      osc1.frequency.setValueAtTime(261.63, audioContext.currentTime); // C4
      osc1.frequency.setValueAtTime(329.63, audioContext.currentTime + 0.1); // E4
      osc1.frequency.setValueAtTime(392, audioContext.currentTime + 0.2); // G4
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      osc1.start(audioContext.currentTime);
      osc1.stop(audioContext.currentTime + 0.5);
      
    } else {
      // Default fallback
      const osc1 = audioContext.createOscillator();
      osc1.connect(gainNode);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, audioContext.currentTime);
      osc1.frequency.setValueAtTime(880, audioContext.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      osc1.start(audioContext.currentTime);
      osc1.stop(audioContext.currentTime + 0.4);
    }
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
  event_title?: string;
  created_at?: string;
  pos_user_name?: string;
  pos_user_icon?: string;
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
  const [checkinNotificationsEnabled, setCheckinNotificationsEnabled] = useState(true);
  const [newTicketHolderIds, setNewTicketHolderIds] = useState<Set<string>>(new Set());
  const previousTicketHolderIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  // Keep track of previous ticket capacities (do NOT rely on payload.old, which may be incomplete)
  const previousTicketCapacitiesRef = useRef<Map<string, number>>(new Map());
  const capacityDismissTimeoutRef = useRef<number | null>(null);
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
  const [ticketCapacities, setTicketCapacities] = useState<{ [key: string]: number }>({});
  const [paymentMethodStats, setPaymentMethodStats] = useState<{ sadad: number; pos: number }>({ sadad: 0, pos: 0 });
  const [paymentMethodByTypeStats, setPaymentMethodByTypeStats] = useState<{
    sadad: { [key: string]: { total: number; present: number } };
    pos: { [key: string]: { total: number; present: number } };
  }>({ sadad: {}, pos: {} });
  const [nationalityStats, setNationalityStats] = useState<{
    [nationality: string]: { online: number; pos: number; total: number; present: number };
  }>({});
  const [, forceUpdate] = useState(0);
  const [isDateInitialized, setIsDateInitialized] = useState(false);
  const [dailySalesDialogOpen, setDailySalesDialogOpen] = useState(false);
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  
  // Capacity increase notification state
  const [capacityNotification, setCapacityNotification] = useState<{
    ticketType: string;
    increase: number;
    newCapacity: number;
  } | null>(null);
  const [showCapacityNotification, setShowCapacityNotification] = useState(false);

  const dismissCapacityNotification = useCallback(() => {
    setShowCapacityNotification(false);
    setCapacityNotification(null);
    if (capacityDismissTimeoutRef.current) {
      window.clearTimeout(capacityDismissTimeoutRef.current);
      capacityDismissTimeoutRef.current = null;
    }
  }, []);

  // Cleanup pending timeout on unmount
  useEffect(() => {
    return () => {
      if (capacityDismissTimeoutRef.current) {
        window.clearTimeout(capacityDismissTimeoutRef.current);
      }
    };
  }, []);

  // Check if a booking is within the last 5 minutes (for highlight)
  const isRecentBooking = (createdAt: string | undefined): boolean => {
    if (!createdAt) return false;
    const bookingTime = new Date(createdAt).getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return bookingTime > fiveMinutesAgo;
  };

  // Auto-refresh every 30 seconds to update highlight status
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate(n => n + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

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

  // Store selectedDate in ref for realtime callbacks
  const selectedDateRef = useRef<Date | undefined>(undefined);
  
  // Keep ref in sync with state
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

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
          selectedDateRef.current = eventDate;
          console.log("Auto-selected upcoming event date:", eventDate);
        } else {
          // Fallback to today if no upcoming events
          const now = new Date();
          const todayDate = toZonedTime(now, QATAR_TIMEZONE);
          setSelectedDate(todayDate);
          selectedDateRef.current = todayDate;
        }
        setIsDateInitialized(true);
      } catch (error) {
        console.error("Failed to fetch upcoming event:", error);
        // Fallback to today on error
        const now = new Date();
        const todayDate = toZonedTime(now, QATAR_TIMEZONE);
        setSelectedDate(todayDate);
        selectedDateRef.current = todayDate;
        setIsDateInitialized(true);
      }
    };

    fetchUpcomingEvent();
    fetchSettings();
  }, []);

  // Setup realtime subscription after date is initialized
  useEffect(() => {
    if (!isDateInitialized) return;
    
    const cleanup = setupRealtimeSubscription();
    return cleanup;
  }, [isDateInitialized]);

  useEffect(() => {
    // Only fetch bookings after date has been initialized to prevent showing unfiltered data first
    if (isDateInitialized) {
      fetchBookings();
    }
  }, [selectedDate, isDateInitialized]);


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

  const fetchBookings = async (useRefDate = false) => {
    // Use ref date for realtime callbacks to avoid stale closure issues
    const dateToUse = useRefDate ? selectedDateRef.current : selectedDate;
    
    try {
      // IMPORTANT: PostgREST defaults to 1000 rows per request.
      // We must paginate to get all orders across all events.
      const PAGE_SIZE = 1000;
      const allOrders: any[] = [];

      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("orders")
          .select(`
            *,
            customers(name, email, phone, id_number, nationality),
            events(title, event_date),
            ticket_holders(*),
            pos_users(name, icon)
          `)
          .eq("payment_status", "confirmed")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        if (data?.length) allOrders.push(...data);

        // If we got fewer than PAGE_SIZE, we've fetched all rows
        if (!data || data.length < PAGE_SIZE) break;
      }

      console.log("Raw data from Supabase (paginated):", allOrders.length, "orders");
      console.log("Using date for filter:", dateToUse);

      // Filter by event date on client side if date is selected
      let filteredData = allOrders;
      if (dateToUse) {
        // Extract date components from selected date (ignoring time)
        const selectedYear = dateToUse.getFullYear();
        const selectedMonth = dateToUse.getMonth();
        const selectedDay = dateToUse.getDate();
        
        console.log(`Filtering for date: ${selectedYear}-${selectedMonth + 1}-${selectedDay}`);
        
        filteredData = filteredData.filter((order: any) => {
          if (!order.events?.event_date) return false;
          // Convert event date to Qatar timezone
          const eventDate = toZonedTime(new Date(order.events.event_date), QATAR_TIMEZONE);
          // Compare year, month, and day only
          return eventDate.getFullYear() === selectedYear &&
                 eventDate.getMonth() === selectedMonth &&
                 eventDate.getDate() === selectedDay;
        });
        
        console.log(`Filtered ${allOrders.length} orders to ${filteredData.length} for selected date`);
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
              n8n_responded_at: order.n8n_responded_at,
              event_title: order.events?.title,
              created_at: order.created_at,
              pos_user_name: order.pos_users?.name,
              pos_user_icon: order.pos_users?.icon
            });
          });
        }
      });

      console.log("Total ticket holders extracted:", allTicketHolders.length);
      console.log("Ticket holders:", allTicketHolders);

      setBookings(filteredData);
      setTicketHolders(allTicketHolders);
      calculateStats(filteredData, allTicketHolders);
      
      // Fetch ticket capacities for the event
      if (filteredData.length > 0 && filteredData[0].event_id) {
        const eventId = filteredData[0].event_id;
        const { data: ticketsData } = await supabase
          .from("tickets")
          .select("type, available_quantity")
          .eq("event_id", eventId);
        
        if (ticketsData) {
          const capacities: { [key: string]: number } = {};
          const capacitiesMap = new Map<string, number>();
          ticketsData.forEach(ticket => {
            capacities[ticket.type] = ticket.available_quantity;
            capacitiesMap.set(ticket.type, ticket.available_quantity);
          });
          setTicketCapacities(capacities);
          previousTicketCapacitiesRef.current = capacitiesMap;
        }
      }
      
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
        async (payload) => {
          console.log('Order update:', payload);
          // Play sound and show detailed toast for new confirmed orders
          if (payload.eventType === 'INSERT' && (payload.new as any)?.payment_status === 'confirmed') {
            if (!isInitialLoadRef.current) {
              const newOrder = payload.new as any;
              
              // Fetch additional details for the toast notification
              try {
               const isPOS = newOrder.payment_method === 'cash_pos';
               
               if (isPOS) {
                 // Fetch POS user details for POS orders
                 const { data: posOrderDetails } = await supabase
                   .from('orders')
                   .select(`
                     quantity,
                     customers(name, nationality),
                     events(title, event_date),
                     pos_users(name, icon)
                   `)
                   .eq('id', newOrder.id)
                   .single();
                 
                 if (posOrderDetails) {
                   const customerName = posOrderDetails.customers?.name || 'عميل';
                   const nationality = posOrderDetails.customers?.nationality || 'غير محدد';
                   const flag = getNationalityFlag(nationality);
                   const quantity = posOrderDetails.quantity || 1;
                   const posUserName = posOrderDetails.pos_users?.name || 'موظف';
                   const posUserIcon = posOrderDetails.pos_users?.icon || '👤';
                   
                   if (soundEnabled) {
                     playNotificationSound();
                   }
                   
                   toast.success(
                     <div className="flex flex-col gap-2 text-right" dir="rtl">
                       <div className="flex items-center gap-2 justify-end">
                         <Store className="w-4 h-4 text-orange-500" />
                         <span className="font-bold text-orange-600">تسجيل من نقطة البيع</span>
                       </div>
                       <div className="flex items-center gap-2 justify-end">
                         <span className="text-lg">{flag}</span>
                         <span className="font-semibold">{customerName}</span>
                         <span className="text-muted-foreground">({nationality})</span>
                       </div>
                       <div className="flex items-center gap-3 justify-end text-sm">
                         <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                           🎫 {quantity} {quantity === 1 ? 'تذكرة' : quantity === 2 ? 'تذكرتين' : quantity <= 10 ? 'تذاكر' : 'تذكرة'}
                         </span>
                       </div>
                       <div className="flex items-center gap-2 justify-end text-xs text-muted-foreground border-t pt-2 mt-1">
                         <span>{posUserIcon}</span>
                         <span>بواسطة: {posUserName}</span>
                       </div>
                     </div>,
                     {
                       duration: 6000,
                       position: 'top-right',
                       className: 'bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/50 dark:to-amber-950/50 border-orange-200 dark:border-orange-800',
                      }
                   );
                 }
               } else {
                 // Online booking (Sadad) - existing notification
                 const { data: orderDetails } = await supabase
                   .from('orders')
                   .select(`
                     quantity,
                     customers(nationality),
                     events(title, event_date)
                   `)
                   .eq('id', newOrder.id)
                   .single();
                 
                 if (orderDetails) {
                   const nationality = orderDetails.customers?.nationality || 'غير محدد';
                   const flag = getNationalityFlag(nationality);
                   const quantity = orderDetails.quantity || 1;
                   const eventDate = orderDetails.events?.event_date 
                     ? new Date(orderDetails.events.event_date).toLocaleDateString('ar-u-nu-latn', { 
                         day: 'numeric', 
                         month: 'long' 
                       })
                     : '';
                   
                   if (soundEnabled) {
                     playNotificationSound();
                   }
                   
                   toast.success(
                     `${flag} حجز جديد من ${nationality}\n🎫 ${quantity} تذكرة ليوم ${eventDate}`,
                     {
                       duration: 5000,
                       style: {
                         whiteSpace: 'pre-line',
                         textAlign: 'right',
                         direction: 'rtl'
                       }
                     }
                   );
                 }
                }
              } catch (err) {
                console.error('Error fetching order details for toast:', err);
                if (soundEnabled) {
                  playNotificationSound();
                }
                toast.success("🎫 حجز جديد!");
              }
            }
          }
          // Use ref date to avoid stale closure
          fetchBookings(true);
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
        async (payload) => {
          console.log('Ticket holder change:', payload);
          
          // Show notification for check-ins (when is_present becomes true)
          if (payload.eventType === 'UPDATE' && !isInitialLoadRef.current) {
            const oldData = payload.old as any;
            const newData = payload.new as any;
            
            // Check if is_present changed from false/null to true
            if (newData.is_present === true && oldData.is_present !== true) {
              try {
                // Fetch ticket holder details for the notification
                const { data: holderDetails } = await supabase
                  .from('ticket_holders')
                  .select(`
                    name,
                    ticket_type,
                    nationality,
                    orders!inner(
                      events!inner(title, event_date)
                    )
                  `)
                  .eq('id', newData.id)
                  .single();
                
                if (holderDetails && checkinNotificationsEnabled) {
                  const nationality = holderDetails.nationality || 'غير محدد';
                  const flag = getNationalityFlag(nationality);
                  const ticketTypeLabel = holderDetails.ticket_type === 'vip' ? 'VIP' : 
                                          holderDetails.ticket_type === 'normal' ? 'عادي' : 
                                          holderDetails.ticket_type === 'parking' ? 'مواقف' : holderDetails.ticket_type;
                  
                  // Get styling based on ticket type
                  const getTicketStyle = () => {
                    switch (holderDetails.ticket_type) {
                      case 'vip':
                        return {
                          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                          border: '2px solid #d97706',
                          color: '#78350f',
                          icon: '👑'
                        };
                      case 'normal':
                        return {
                          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                          border: '2px solid #15803d',
                          color: '#ffffff',
                          icon: '🎫'
                        };
                      case 'parking':
                        return {
                          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                          border: '2px solid #1d4ed8',
                          color: '#ffffff',
                          icon: '🅿️'
                        };
                      default:
                        return {
                          background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                          border: '2px solid #374151',
                          color: '#ffffff',
                          icon: '🎫'
                        };
                    }
                  };
                  
                  const style = getTicketStyle();
                  
                  if (soundEnabled) {
                    playCheckinSound(holderDetails.ticket_type);
                  }
                  
                  toast.success(
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', direction: 'rtl', textAlign: 'right' }}>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                        <span>{holderDetails.name}</span>
                        <span style={{ fontSize: '24px' }}>{flag}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', opacity: 0.9 }}>
                        <span style={{ fontWeight: 500 }}>تذكرة {ticketTypeLabel}</span>
                        <span style={{ fontSize: '16px' }}>{style.icon}</span>
                      </div>
                      <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '2px' }}>
                        ✅ تم تسجيل الحضور
                      </div>
                    </div>,
                    {
                      duration: 5000,
                      style: {
                        background: style.background,
                        border: style.border,
                        color: style.color,
                        padding: '16px 20px',
                        borderRadius: '12px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                        minWidth: '280px'
                      }
                    }
                  );
                }
              } catch (err) {
                console.error('Error fetching holder details for check-in toast:', err);
              }
            }
          }
          
          // Use ref date to avoid stale closure
          fetchBookings(true);
        }
      )
      .subscribe();

    // Subscribe to tickets changes for capacity updates
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
          console.log('Ticket capacity update:', payload);
          const newTicket = payload.new as any;

          if (!newTicket) return;

          const ticketType = newTicket.type as string;
          const newCapacity = Number(newTicket.available_quantity ?? 0);
          const oldCapacity = previousTicketCapacitiesRef.current.get(ticketType);

          // Update the capacities state immediately
          setTicketCapacities(prev => ({
            ...prev,
            [ticketType]: newCapacity
          }));

          // If we don't know the previous capacity yet, seed and skip notifying (avoids false positives)
          if (typeof oldCapacity !== 'number') {
            previousTicketCapacitiesRef.current.set(ticketType, newCapacity);
            return;
          }

          if (!isInitialLoadRef.current && newCapacity > oldCapacity) {
            const increase = newCapacity - oldCapacity;

            if (soundEnabled) {
              playCapacityIncreaseSound(ticketType);
            }

            // Show centered banner notification
            setCapacityNotification({ ticketType, increase, newCapacity });
            setShowCapacityNotification(true);

            // Auto-dismiss after 4 seconds (reset if another increase arrives)
            if (capacityDismissTimeoutRef.current) {
              window.clearTimeout(capacityDismissTimeoutRef.current);
            }
            capacityDismissTimeoutRef.current = window.setTimeout(() => {
              dismissCapacityNotification();
            }, 4000);
          }

          // Always update stored capacity
          previousTicketCapacitiesRef.current.set(ticketType, newCapacity);
        }
      )
      .subscribe();

    // Subscribe to pos_users changes to update names in real-time
    const posUsersChannel = supabase
      .channel('live-bookings-pos-users')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pos_users'
        },
        (payload) => {
          console.log('POS user change:', payload);
          // Refetch bookings to get updated POS user names
          fetchBookings(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(ticketHoldersChannel);
      supabase.removeChannel(ticketsChannel);
      supabase.removeChannel(posUsersChannel);
    };
  };

  // Fetch daily sales statistics - calculate revenue by ticket holder type using ticket prices
  const fetchDailySales = async () => {
    try {
      // IMPORTANT: PostgREST defaults to 1000 rows per request.
      // We must paginate, otherwise older/high-volume dates (like 17/1) will show wrong totals.
      const PAGE_SIZE = 1000;
      const allTicketHolders: any[] = [];

      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from("ticket_holders")
          .select(
            `
            id,
            ticket_type,
            order_id,
            created_at,
            orders!inner(
              payment_status,
              event_id,
              total_amount,
              events!inner(
                title,
                event_date
              )
            )
          `
          )
          .eq("orders.payment_status", "confirmed")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        if (data?.length) allTicketHolders.push(...data);

        if (!data || data.length < PAGE_SIZE) break;
      }

      // Fetch all ticket prices
      const { data: ticketPrices, error: ticketError } = await supabase
        .from("tickets")
        .select("event_id, type, price");

      if (ticketError) throw ticketError;

      // Create a map of ticket prices by event_id and type
      const priceMap = (ticketPrices || []).reduce((acc, ticket) => {
        const key = `${ticket.event_id}-${ticket.type}`;
        acc[key] = ticket.price;
        return acc;
      }, {} as Record<string, number>);

      // Group by event date and calculate revenue by ticket holder's ticket_type
      const grouped = (allTicketHolders || []).reduce((acc: Record<string, DailySummary>, holder: any) => {
        const eventDate = holder.orders.events.event_date;
        // Extract just the date portion (YYYY-MM-DD) - handle both ISO format (T separator) and DB format (space separator)
        const date = typeof eventDate === 'string' ? eventDate.substring(0, 10) : '';
        const eventId = holder.orders.event_id;
        const ticketType = holder.ticket_type;

        if (!date) return acc;

        if (!acc[date]) {
          acc[date] = {
            date,
            event_title: holder.orders.events.title || 'Unknown Event',
            vip_count: 0,
            vip_amount: 0,
            normal_count: 0,
            normal_amount: 0,
            parking_count: 0,
            parking_amount: 0,
            daily_total: 0
          };
        }

        // Get price for this ticket holder's ticket type
        const price = priceMap[`${eventId}-${ticketType}`] || 0;

        if (ticketType === 'vip') {
          acc[date].vip_count += 1;
          acc[date].vip_amount += price;
          acc[date].vip_price = price;
        } else if (ticketType === 'normal') {
          acc[date].normal_count += 1;
          acc[date].normal_amount += price;
          acc[date].normal_price = price;
        } else if (ticketType === 'parking') {
          acc[date].parking_count += 1;
          acc[date].parking_amount += price;
          acc[date].parking_price = price;
        }

        acc[date].daily_total += price;

        return acc;
      }, {} as Record<string, DailySummary>);

      const summariesArray = (Object.values(grouped) as DailySummary[])
        .filter(s => s.date >= '2026-01-12')
        .sort((a, b) => a.date.localeCompare(b.date));

      setDailySummaries(summariesArray);
    } catch (error) {
      console.error("Error fetching daily sales:", error);
    }
  };

  // Fetch daily sales when dialog opens and on realtime updates
  useEffect(() => {
    if (dailySalesDialogOpen) {
      fetchDailySales();
    }
  }, [dailySalesDialogOpen]);

  // Update daily sales on realtime changes (if dialog is open)
  useEffect(() => {
    if (dailySalesDialogOpen && isDateInitialized) {
      fetchDailySales();
    }
  }, [ticketHolders, dailySalesDialogOpen, isDateInitialized]);

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

    // Calculate nationality breakdown by payment method
    const nationalityBreakdown: { [nationality: string]: { online: number; pos: number; total: number; present: number } } = {};

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

        // Track nationality stats
        const nationality = holder.nationality || 'غير محدد';
        if (!nationalityBreakdown[nationality]) {
          nationalityBreakdown[nationality] = { online: 0, pos: 0, total: 0, present: 0 };
        }
        if (booking.payment_method === 'sadad') {
          nationalityBreakdown[nationality].online += 1;
        } else {
          nationalityBreakdown[nationality].pos += 1;
        }
        nationalityBreakdown[nationality].total += 1;
        if (holder.is_present) {
          nationalityBreakdown[nationality].present += 1;
        }
      });
    });

    setStats({ total, confirmed, present, totalTickets, totalTicketHolders, presentTicketHolders, lastHourBookings });
    setTicketTypeStats(typeBreakdown);
    setPaymentMethodStats({ sadad: sadadCount, pos: posCount });
    setPaymentMethodByTypeStats(paymentByType);
    setNationalityStats(nationalityBreakdown);
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
      {/* Capacity Increase Notification Banner */}
      {showCapacityNotification && capacityNotification && (
        <CapacityNotificationBanner
          ticketType={capacityNotification.ticketType}
          increase={capacityNotification.increase}
          newCapacity={capacityNotification.newCapacity}
          onDismiss={dismissCapacityNotification}
        />
      )}
      
      {/* Header with Logo */}
      <header className="border-b backdrop-blur-sm sticky top-0 z-10" style={{ backgroundColor: headerBgColor }}>
        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-4 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-2 sm:gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-8 sm:h-12 object-contain" />
            ) : (
              <h1 className="text-lg sm:text-2xl font-bold">{t("liveBookings")}</h1>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-4 flex-wrap">
            <div className="flex gap-1 sm:gap-2">
              <Button
                variant={viewType === "cards" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewType("cards")}
                className="font-lusail text-xs sm:text-sm px-2 sm:px-3"
              >
                <LayoutGrid className="w-3 h-3 sm:w-4 sm:h-4 ml-1 sm:ml-2" />
                <span className="hidden sm:inline">عرض البطاقات</span>
                <span className="sm:hidden">بطاقات</span>
              </Button>
              <Button
                variant={viewType === "table" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewType("table")}
                className="font-lusail text-xs sm:text-sm px-2 sm:px-3"
              >
                <TableIcon className="w-3 h-3 sm:w-4 sm:h-4 ml-1 sm:ml-2" />
                <span className="hidden sm:inline">عرض الجدول</span>
                <span className="sm:hidden">جدول</span>
              </Button>
              
              {/* Daily Sales Stats Button */}
              <Dialog open={dailySalesDialogOpen} onOpenChange={setDailySalesDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-lusail text-xs sm:text-sm px-2 sm:px-3"
                    title="إحصائيات المبيعات اليومية"
                  >
                    <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4 ml-1 sm:ml-2" />
                    <span className="hidden sm:inline">إحصائيات</span>
                    <span className="sm:hidden">📊</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-auto" dir="rtl">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-lusail">إحصائيات المبيعات اليومية</DialogTitle>
                  </DialogHeader>
                  
                  {dailySummaries.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm min-w-[700px]">
                        <thead>
                          <tr className="border-b-2">
                            <th className="text-center p-2 sm:p-3 font-lusail font-bold whitespace-nowrap">التاريخ</th>
                            <th colSpan={3} className="text-center p-2 sm:p-3 font-lusail font-bold border-x whitespace-nowrap">VIP</th>
                            <th colSpan={3} className="text-center p-2 sm:p-3 font-lusail font-bold border-x whitespace-nowrap">عادي</th>
                            <th colSpan={3} className="text-center p-2 sm:p-3 font-lusail font-bold border-x whitespace-nowrap">مواقف</th>
                            <th className="text-center p-2 sm:p-3 font-lusail font-bold whitespace-nowrap">الإجمالي</th>
                          </tr>
                          <tr className="border-b bg-muted/30">
                            <th className="p-1 sm:p-2"></th>
                            <th className="text-center p-1 sm:p-2 font-lusail text-xs whitespace-nowrap">العدد</th>
                            <th className="text-center p-1 sm:p-2 font-lusail text-xs whitespace-nowrap">السعر</th>
                            <th className="text-center p-1 sm:p-2 font-lusail text-xs border-l whitespace-nowrap">المبلغ</th>
                            <th className="text-center p-1 sm:p-2 font-lusail text-xs whitespace-nowrap">العدد</th>
                            <th className="text-center p-1 sm:p-2 font-lusail text-xs whitespace-nowrap">السعر</th>
                            <th className="text-center p-1 sm:p-2 font-lusail text-xs border-l whitespace-nowrap">المبلغ</th>
                            <th className="text-center p-1 sm:p-2 font-lusail text-xs whitespace-nowrap">العدد</th>
                            <th className="text-center p-1 sm:p-2 font-lusail text-xs whitespace-nowrap">السعر</th>
                            <th className="text-center p-1 sm:p-2 font-lusail text-xs border-l whitespace-nowrap">المبلغ</th>
                            <th className="p-1 sm:p-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {dailySummaries.map((summary) => (
                            <tr key={summary.date} className="border-b hover:bg-muted/20">
                              <td className="p-2 sm:p-3 font-lusail text-xs sm:text-sm whitespace-nowrap">
                                {(() => {
                                  const date = new Date(summary.date);
                                  const arabicWeekdays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                                  const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
                                  return `${arabicWeekdays[date.getDay()]} ${date.getDate()} ${arabicMonths[date.getMonth()]}`;
                                })()}
                              </td>
                              {/* VIP */}
                              <td className="text-center p-2 sm:p-3 font-lusail font-bold text-xs sm:text-sm whitespace-nowrap">{summary.vip_count || '-'}</td>
                              <td className="text-center p-2 sm:p-3 font-lusail text-xs sm:text-sm whitespace-nowrap">{summary.vip_price ? summary.vip_price.toFixed(0) : '-'}</td>
                              <td className="text-center p-2 sm:p-3 font-lusail font-bold text-destructive border-l text-xs sm:text-sm whitespace-nowrap">{summary.vip_amount > 0 ? summary.vip_amount.toFixed(0) : '-'}</td>
                              {/* Normal */}
                              <td className="text-center p-2 sm:p-3 font-lusail font-bold text-xs sm:text-sm whitespace-nowrap">{summary.normal_count || '-'}</td>
                              <td className="text-center p-2 sm:p-3 font-lusail text-xs sm:text-sm whitespace-nowrap">{summary.normal_price ? summary.normal_price.toFixed(0) : '-'}</td>
                              <td className="text-center p-2 sm:p-3 font-lusail font-bold text-destructive border-l text-xs sm:text-sm whitespace-nowrap">{summary.normal_amount > 0 ? summary.normal_amount.toFixed(0) : '-'}</td>
                              {/* Parking */}
                              <td className="text-center p-2 sm:p-3 font-lusail font-bold text-xs sm:text-sm whitespace-nowrap">{summary.parking_count || '-'}</td>
                              <td className="text-center p-2 sm:p-3 font-lusail text-xs sm:text-sm whitespace-nowrap">{summary.parking_price ? summary.parking_price.toFixed(0) : '-'}</td>
                              <td className="text-center p-2 sm:p-3 font-lusail font-bold text-destructive border-l text-xs sm:text-sm whitespace-nowrap">{summary.parking_amount > 0 ? summary.parking_amount.toFixed(0) : '-'}</td>
                              {/* Daily Total */}
                              <td className="text-center p-2 sm:p-3 font-lusail font-bold text-primary text-xs sm:text-sm whitespace-nowrap">
                                {summary.daily_total.toFixed(0)} <span className="text-[10px]">ر.ق</span>
                              </td>
                            </tr>
                          ))}
                          {/* Grand Total Row */}
                          <tr className="bg-muted/50 font-bold border-t-2">
                            <td className="p-2 sm:p-3 font-lusail text-sm sm:text-base">الإجمالي الكلي</td>
                            <td className="text-center p-2 sm:p-3 font-lusail text-sm sm:text-base">
                              {dailySummaries.reduce((acc, s) => acc + s.vip_count, 0)}
                            </td>
                            <td className="text-center p-2 sm:p-3 font-lusail text-xs sm:text-sm">
                              {dailySummaries[0]?.vip_price ? dailySummaries[0].vip_price.toFixed(0) : '-'}
                            </td>
                            <td className="text-center p-2 sm:p-3 font-lusail text-destructive border-l text-sm sm:text-base">
                              {dailySummaries.reduce((acc, s) => acc + s.vip_amount, 0).toFixed(0)}
                            </td>
                            <td className="text-center p-2 sm:p-3 font-lusail text-sm sm:text-base">
                              {dailySummaries.reduce((acc, s) => acc + s.normal_count, 0)}
                            </td>
                            <td className="text-center p-2 sm:p-3 font-lusail text-xs sm:text-sm">
                              {dailySummaries[0]?.normal_price ? dailySummaries[0].normal_price.toFixed(0) : '-'}
                            </td>
                            <td className="text-center p-2 sm:p-3 font-lusail text-destructive border-l text-sm sm:text-base">
                              {dailySummaries.reduce((acc, s) => acc + s.normal_amount, 0).toFixed(0)}
                            </td>
                            <td className="text-center p-2 sm:p-3 font-lusail text-sm sm:text-base">
                              {dailySummaries.reduce((acc, s) => acc + s.parking_count, 0)}
                            </td>
                            <td className="text-center p-2 sm:p-3 font-lusail text-xs sm:text-sm">
                              {dailySummaries[0]?.parking_price ? dailySummaries[0].parking_price.toFixed(0) : '-'}
                            </td>
                            <td className="text-center p-2 sm:p-3 font-lusail text-destructive border-l text-sm sm:text-base">
                              {dailySummaries.reduce((acc, s) => acc + s.parking_amount, 0).toFixed(0)}
                            </td>
                            <td className="text-center p-2 sm:p-3 font-lusail text-primary text-base sm:text-lg">
                              {dailySummaries.reduce((acc, s) => acc + s.daily_total, 0).toFixed(0)} <span className="text-xs">ر.ق</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground font-lusail">
                      لا توجد بيانات مبيعات
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-10 sm:w-10"
              onClick={() => setCheckinNotificationsEnabled(!checkinNotificationsEnabled)}
              title={checkinNotificationsEnabled ? "إيقاف إشعارات الحضور" : "تفعيل إشعارات الحضور"}
            >
              {checkinNotificationsEnabled ? (
                <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              ) : (
                <BellOff className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-10 sm:w-10"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "إيقاف الصوت" : "تفعيل الصوت"}
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
              ) : (
                <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-10 sm:w-10"
              onClick={toggleFullscreen}
              title={isFullscreen ? "تصغير الشاشة" : "ملء الشاشة"}
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="w-full py-4 sm:py-8 px-2 sm:px-[5%] flex-1">

        {/* Date Selector and Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-4 sm:mb-8">
          <Card className="p-2 sm:p-3">
            <div className="flex flex-col gap-1 sm:gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full justify-start text-right font-lusail text-[10px] sm:text-xs h-7 sm:h-8",
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
                  className="font-lusail text-[8px] sm:text-[10px] h-5 sm:h-6 py-0"
                >
                  عرض الكل
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-2 sm:p-3 bg-blue-50 dark:bg-blue-950">
            <div className="flex items-center gap-1 sm:gap-2">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground leading-tight truncate">{t("totalBookings")}</p>
                <p className="text-base sm:text-lg font-bold">{stats.total}</p>
              </div>
            </div>
          </Card>

          <Card className="p-2 sm:p-3 bg-green-50 dark:bg-green-950">
            <div className="flex items-center gap-1 sm:gap-2">
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground leading-tight truncate">{t("confirmedBookings")}</p>
                <p className="text-base sm:text-lg font-bold text-green-600">{stats.confirmed}</p>
              </div>
            </div>
          </Card>

          <Card className="p-2 sm:p-3 bg-purple-50 dark:bg-purple-950">
            <div className="flex items-center gap-1 sm:gap-2">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground leading-tight truncate">إجمالي التذاكر</p>
                <p className="text-base sm:text-lg font-bold text-purple-600">{stats.totalTicketHolders}</p>
              </div>
            </div>
          </Card>

          <Card className="p-2 sm:p-3 bg-orange-50 dark:bg-orange-950">
            <div className="flex items-center gap-1 sm:gap-2">
              <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground leading-tight truncate">الحاضرون</p>
                <p className="text-base sm:text-lg font-bold text-orange-600">{stats.presentTicketHolders}</p>
              </div>
            </div>
          </Card>

          <Card className="p-2 sm:p-3 bg-cyan-50 dark:bg-cyan-950">
            <div className="flex items-center gap-1 sm:gap-2">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[8px] sm:text-[10px] text-muted-foreground leading-tight truncate">آخر ساعة</p>
                <p className="text-base sm:text-lg font-bold text-cyan-600">{stats.lastHourBookings}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Payment Method Breakdown */}
        <div className="mb-4 sm:mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
            {/* Online (Sadad) - Left Side */}
            <Card className="p-3 sm:p-6 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
              <div className="space-y-2 sm:space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                  <Badge variant="outline" className="text-xs sm:text-sm font-bold bg-blue-500/10">
                    أونلاين
                  </Badge>
                </div>
                <div className="text-center">
                  <p className="text-2xl sm:text-4xl font-bold text-blue-600">{paymentMethodStats.sadad}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">إجمالي تذاكر سداد</p>
                </div>
                {Object.keys(paymentMethodByTypeStats.sadad).length > 0 && (
                  <div className="pt-2 sm:pt-3 border-t border-blue-500/20 space-y-1 sm:space-y-2">
                    {Object.entries(paymentMethodByTypeStats.sadad)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([type, stats]) => (
                        <div key={type} className="flex justify-between items-center text-xs sm:text-sm">
                          <span className="font-medium">{type}</span>
                          <div className="flex gap-2 sm:gap-3 items-center">
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
            <Card className="p-3 sm:p-6 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
              <div className="space-y-2 sm:space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <Store className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
                  <Badge variant="outline" className="text-xs sm:text-sm font-bold bg-orange-500/10">
                    نقاط البيع
                  </Badge>
                </div>
                <div className="text-center">
                  <p className="text-2xl sm:text-4xl font-bold text-orange-600">{paymentMethodStats.pos}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">إجمالي تذاكر POS</p>
                </div>
                {Object.keys(paymentMethodByTypeStats.pos).length > 0 && (
                  <div className="pt-2 sm:pt-3 border-t border-orange-500/20 space-y-1 sm:space-y-2">
                    {Object.entries(paymentMethodByTypeStats.pos)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([type, stats]) => (
                        <div key={type} className="flex justify-between items-center text-xs sm:text-sm">
                          <span className="font-medium">{type}</span>
                          <div className="flex gap-2 sm:gap-3 items-center">
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

        {/* Ticket Type & Nationality Breakdown */}
        <div className="mb-4 sm:mb-8 grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6">
          {/* Ticket Type Breakdown */}
          {Object.keys(ticketTypeStats).length > 0 && (
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-4">التذاكر حسب النوع</h3>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {Object.entries(ticketTypeStats)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([type, stats]) => (
                    <Card key={type} className="p-2 sm:p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                      <div className="text-center space-y-1 sm:space-y-2">
                        <Badge variant="outline" className="text-[10px] sm:text-xs font-bold">
                          {type.toUpperCase()}
                        </Badge>
                        <div>
                          <p className="text-xl sm:text-3xl font-bold text-primary">
                            {stats.total}
                            {ticketCapacities[type] && (
                              <span className="text-muted-foreground/60 font-normal text-base sm:text-xl"> / {ticketCapacities[type]}</span>
                            )}
                          </p>
                          <p className="text-[8px] sm:text-xs text-muted-foreground">إجمالي</p>
                        </div>
                        <div className="pt-1 sm:pt-2 border-t">
                          <p className="text-lg sm:text-2xl font-bold text-green-600">{stats.present}</p>
                          <p className="text-[8px] sm:text-xs text-muted-foreground">حاضر</p>
                        </div>
                      </div>
                    </Card>
                  ))}
              </div>
            </div>
          )}

          {/* Nationality Breakdown */}
          {Object.keys(nationalityStats).length > 0 && (
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-4">التذاكر حسب الجنسية</h3>
              <Card className="p-2 sm:p-4">
                <div className="space-y-2 sm:space-y-3 max-h-60 sm:max-h-80 overflow-y-auto">
                  {Object.entries(nationalityStats)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([nationality, stats]) => (
                      <div key={nationality} className="flex items-center justify-between p-1.5 sm:p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                          <span className="text-base sm:text-xl">{getNationalityFlag(nationality)}</span>
                          <span className="font-medium text-xs sm:text-sm truncate">{nationality}</span>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-3 text-[10px] sm:text-sm flex-shrink-0">
                          <div className="flex items-center gap-0.5 sm:gap-1">
                            <Globe className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-blue-500" />
                            <span className="text-blue-600 font-semibold">{stats.online}</span>
                          </div>
                          <span className="text-muted-foreground hidden sm:inline">|</span>
                          <div className="flex items-center gap-0.5 sm:gap-1">
                            <Store className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-orange-500" />
                            <span className="text-orange-600 font-semibold">{stats.pos}</span>
                          </div>
                          <span className="text-muted-foreground hidden sm:inline">|</span>
                          <div className="flex items-center gap-0.5 sm:gap-1">
                            <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-green-500" />
                            <span className="text-green-600 font-semibold">{stats.present}</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px] sm:text-xs ml-1">
                            {stats.total}
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Ticket Holders Display */}
        {viewType === "cards" ? (
          /* Cards View - Individual Ticket Holders */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-2 sm:gap-3">
            {ticketHolders.length === 0 ? (
              <Card className="col-span-full p-6 sm:p-12">
                <p className="text-center text-muted-foreground font-lusail">{t("noBookingsForDate")}</p>
              </Card>
            ) : (
              ticketHolders.map((holder, index) => {
                const isRecent = isRecentBooking(holder.created_at);
                const ticketNumber = ticketHolders.length - index; // Descending order (newest first, so reverse the number)
                return (
                <Card 
                  key={holder.id} 
                  className={cn(
                    "p-2.5 sm:p-4 hover:shadow-xl transition-all duration-500 shadow-md relative",
                    newTicketHolderIds.has(holder.id) && "animate-new-booking",
                    isRecent && "animate-recent-pulse"
                  )}
                  style={isRecent ? { 
                    '--pulse-color': headerBgColor,
                    boxShadow: `0 0 0 3px ${headerBgColor}, 0 10px 25px -5px rgba(0, 0, 0, 0.1)`,
                    backgroundColor: `color-mix(in srgb, ${headerBgColor} 15%, transparent)`
                  } as React.CSSProperties : undefined}
                >
                  {/* Daily sequential ticket number */}
                  <div className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 bg-red-500 text-black text-[8px] sm:text-[10px] font-bold rounded px-1 sm:px-1.5 py-0.5 min-w-[16px] sm:min-w-[20px] text-center leading-none">
                    {ticketNumber}
                  </div>
                  <div className="flex flex-col gap-2 sm:gap-3">
                    {/* Event Name - Header */}
                    {holder.event_title && (
                      <div className="bg-primary/10 rounded-md px-2 py-0.5 sm:py-1 text-center">
                        <span className="text-[10px] sm:text-xs font-semibold text-primary truncate">{holder.event_title}</span>
                      </div>
                    )}

                    {/* Name and Flag */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary flex-shrink-0" />
                      <span className="font-semibold text-xs sm:text-sm truncate flex-1 min-w-0">{holder.name}</span>
                      <div className="flex flex-col items-center gap-0.5 sm:gap-1 flex-shrink-0">
                        {holder.nationality && (
                          <span className="text-base sm:text-lg">{getNationalityFlag(holder.nationality)}</span>
                        )}
                        {/* Invoice/POS Status Icon */}
                        {holder.payment_method === 'cash_pos' ? (
                          <div className="flex flex-col items-center" title={holder.pos_user_name ? `POS - ${holder.pos_user_name}` : "POS"}>
                            <Store className="w-3 h-3 sm:w-4 sm:h-4 text-orange-500" />
                            {holder.pos_user_name && (
                              <span className="text-[8px] sm:text-[10px] text-orange-600 font-medium truncate max-w-[60px]">{holder.pos_user_name}</span>
                            )}
                          </div>
                        ) : holder.n8n_responded_at ? (
                          <span title="تم إرسال الفاتورة"><Send className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" /></span>
                        ) : (
                          <span title="لم يتم إرسال الفاتورة"><CircleDashed className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" /></span>
                        )}
                      </div>
                    </div>

                    {/* Phone */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary flex-shrink-0" />
                      <span className="text-[10px] sm:text-xs truncate">{holder.phone}</span>
                    </div>

                    {/* Booking Reference */}
                    {holder.booking_reference && (
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary flex-shrink-0" />
                        <span className="text-[10px] sm:text-xs truncate font-mono">{holder.booking_reference}</span>
                      </div>
                    )}

                    {/* Ticket Type and Attendance */}
                    <div className="flex items-center justify-between gap-1 sm:gap-2">
                      {/* Ticket Type */}
                      <Badge variant="outline" className="text-[10px] sm:text-xs">
                        {holder.ticket_type.toUpperCase()}
                      </Badge>

                      {/* Attendance */}
                      <div className="flex items-center gap-1 sm:gap-2">
                        {holder.is_present ? (
                          <>
                            <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 flex-shrink-0" />
                            <Badge className="bg-green-500 text-[10px] sm:text-xs">
                              حاضر ✓
                            </Badge>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                            <Badge variant="secondary" className="text-[10px] sm:text-xs">
                              غير حاضر
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Confirmed At */}
                    {holder.confirmed_at && (
                      <div className="text-[10px] sm:text-xs text-muted-foreground text-center">
                        تم التأكيد: {format(new Date(holder.confirmed_at), 'dd/MM/yyyy - HH:mm')}
                      </div>
                    )}

                    {/* Booking Date/Time - Footer */}
                    {holder.created_at && (
                      <div className="bg-muted/50 rounded-md px-1.5 sm:px-2 py-0.5 sm:py-1 text-center mt-0.5 sm:mt-1">
                        <span className="text-[8px] sm:text-[10px] text-muted-foreground">
                          تم الحجز في: {format(new Date(holder.created_at), 'dd/MM/yyyy - HH:mm')}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              );
              })
            )}
          </div>
        ) : (
          /* Table View - Individual Ticket Holders */
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right font-lusail text-xs sm:text-sm whitespace-nowrap">الاسم</TableHead>
                    <TableHead className="text-right font-lusail text-xs sm:text-sm whitespace-nowrap hidden sm:table-cell">الهاتف</TableHead>
                    <TableHead className="text-right font-lusail text-xs sm:text-sm whitespace-nowrap hidden md:table-cell">الجنسية</TableHead>
                    <TableHead className="text-right font-lusail text-xs sm:text-sm whitespace-nowrap hidden lg:table-cell">الرقم المرجعي</TableHead>
                    <TableHead className="text-right font-lusail text-xs sm:text-sm whitespace-nowrap">نوع التذكرة</TableHead>
                    <TableHead className="text-right font-lusail text-xs sm:text-sm whitespace-nowrap">الحضور</TableHead>
                    <TableHead className="text-right font-lusail text-xs sm:text-sm whitespace-nowrap hidden xl:table-cell">وقت التأكيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ticketHolders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 sm:py-12">
                        <p className="text-muted-foreground font-lusail text-sm">{t("noBookingsForDate")}</p>
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
                        <TableCell className="font-semibold text-xs sm:text-sm py-2 sm:py-4">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate max-w-[100px] sm:max-w-none">{holder.name}</span>
                            <span className="sm:hidden text-base">{holder.nationality && getNationalityFlag(holder.nationality)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs sm:text-sm py-2 sm:py-4 hidden sm:table-cell">{holder.phone}</TableCell>
                        <TableCell className="text-xs sm:text-sm py-2 sm:py-4 hidden md:table-cell">
                          {holder.nationality && (
                            <span className="flex items-center gap-1">
                              <span>{getNationalityFlag(holder.nationality)}</span>
                              <span className="hidden lg:inline">{holder.nationality}</span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs sm:text-sm py-2 sm:py-4 hidden lg:table-cell">{holder.booking_reference || '-'}</TableCell>
                        <TableCell className="py-2 sm:py-4">
                          <Badge variant="outline" className="text-[10px] sm:text-xs">
                            {holder.ticket_type.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 sm:py-4">
                          {holder.is_present ? (
                            <div className="flex items-center gap-1 sm:gap-2">
                              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />
                              <Badge className="bg-green-500 text-[10px] sm:text-xs">حاضر ✓</Badge>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 sm:gap-2">
                              <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                              <Badge variant="secondary" className="text-[10px] sm:text-xs">غير حاضر</Badge>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm py-2 sm:py-4 hidden xl:table-cell">
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
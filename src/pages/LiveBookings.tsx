import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, CheckCircle, XCircle, Users, LayoutGrid, Table as TableIcon, User, Phone, CreditCard, Hash, Maximize, Minimize } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Footer } from "@/components/Footer";

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
}

interface Booking {
  id: string;
  booking_reference: string;
  payment_status: string;
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
  const [stats, setStats] = useState({
    total: 0,
    confirmed: 0,
    present: 0,
    totalTickets: 0,
    totalTicketHolders: 0,
    presentTicketHolders: 0
  });

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

  useEffect(() => {
    fetchSettings();
    autoSelectUpcomingEvent();
    const cleanup = setupRealtimeSubscription();
    return cleanup;
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [selectedDate]);

  const autoSelectUpcomingEvent = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Fetch all events to find the upcoming one
      const { data: events, error } = await supabase
        .from("events")
        .select("event_date")
        .gte("event_date", today.toISOString())
        .order("event_date", { ascending: true })
        .limit(1);

      if (error) throw error;

      if (events && events.length > 0) {
        // Set the selected date to the upcoming event date
        const upcomingEventDate = new Date(events[0].event_date);
        setSelectedDate(upcomingEventDate);
        console.log("Auto-selected upcoming event date:", format(upcomingEventDate, 'yyyy-MM-dd'));
      } else {
        // No upcoming events
        setLoading(false);
      }
    } catch (error) {
      console.error("Error auto-selecting event:", error);
      setLoading(false);
    }
  };

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
        .order("created_at", { ascending: false });

      if (error) throw error;

      console.log("Raw data from Supabase:", data);
      console.log("First order ticket_holders:", data?.[0]?.ticket_holders);

      // Filter by event date on client side if date is selected
      let filteredData = data || [];
      if (selectedDate) {
        // Format selected date as YYYY-MM-DD for comparison
        const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
        
        filteredData = filteredData.filter((order: any) => {
          if (!order.events?.event_date) return false;
          // Extract just the date part from event_date
          const eventDateStr = order.events.event_date.split('T')[0];
          return eventDateStr === selectedDateStr;
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
              booking_reference: order.booking_reference
            });
          });
        }
      });

      console.log("Total ticket holders extracted:", allTicketHolders.length);
      console.log("Ticket holders:", allTicketHolders);

      setBookings(filteredData);
      setTicketHolders(allTicketHolders);
      calculateStats(filteredData, allTicketHolders);
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
          event: 'UPDATE',
          schema: 'public',
          table: 'ticket_holders'
        },
        (payload) => {
          console.log('Ticket holder update:', payload);
          fetchBookings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(ticketHoldersChannel);
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

    setStats({ total, confirmed, present, totalTickets, totalTicketHolders, presentTicketHolders });
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
    <div className="min-h-screen bg-background font-lusail" dir="rtl">
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

      <div className="w-full py-8 px-[5%]">

        {/* Date Selector and Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
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
                    {selectedDate ? format(selectedDate, "dd/MM") : "تاريخ"}
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
        </div>

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
                <Card key={holder.id} className="p-4 hover:shadow-xl transition-shadow shadow-md">
                  <div className="flex flex-col gap-3">
                    {/* Name and Flag */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="font-semibold text-sm truncate">{holder.name}</span>
                      </div>
                      {holder.nationality && (
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getNationalityFlag(holder.nationality)}</span>
                          <span className="text-xs">{holder.nationality}</span>
                        </div>
                      )}
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
                      <TableRow key={holder.id} className={holder.is_present ? 'bg-green-50 dark:bg-green-950/20' : ''}>
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
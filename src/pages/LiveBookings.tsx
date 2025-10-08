import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, CheckCircle, XCircle, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  };
  events: {
    title: string;
    event_date: string;
  };
}

const LiveBookings = () => {
  const { t } = useTranslation();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [stats, setStats] = useState({
    total: 0,
    confirmed: 0,
    present: 0,
    totalTickets: 0
  });

  useEffect(() => {
    fetchBookings();
    setupRealtimeSubscription();
  }, [selectedDate]);

  const fetchBookings = async () => {
    try {
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          customers(name, email, phone),
          events(title, event_date)
        `)
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      setBookings(data || []);
      calculateStats(data || []);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      toast.error(t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('live-bookings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          console.log('Booking update:', payload);
          fetchBookings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const calculateStats = (bookingsData: Booking[]) => {
    const total = bookingsData.length;
    const confirmed = bookingsData.filter(b => b.payment_status === 'confirmed').length;
    const present = bookingsData.filter(b => b.is_present === true).length;
    const totalTickets = bookingsData.reduce((sum, b) => sum + b.quantity, 0);

    setStats({ total, confirmed, present, totalTickets });
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
    <div className="min-h-screen bg-background py-8 px-4 font-lusail" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{t("liveBookings")}</h1>
          <p className="text-muted-foreground">{t("trackBookingsRealtime")}</p>
        </div>

        {/* Date Selector and Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Card className="p-6">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-right font-lusail",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="ml-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : t("selectDate")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </Card>

          <Card className="p-6 bg-blue-50 dark:bg-blue-950">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-muted-foreground">{t("totalBookings")}</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-green-50 dark:bg-green-950">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm text-muted-foreground">{t("confirmedBookings")}</p>
                <p className="text-2xl font-bold text-green-600">{stats.confirmed}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-purple-50 dark:bg-purple-950">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-sm text-muted-foreground">{t("totalTickets")}</p>
                <p className="text-2xl font-bold text-purple-600">{stats.totalTickets}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-orange-50 dark:bg-orange-950">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-sm text-muted-foreground">{t("presentAttendees")}</p>
                <p className="text-2xl font-bold text-orange-600">{stats.present}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Bookings Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right font-lusail">{t("reference")}</TableHead>
                  <TableHead className="text-right font-lusail">{t("customer")}</TableHead>
                  <TableHead className="text-right font-lusail">{t("event")}</TableHead>
                  <TableHead className="text-right font-lusail">{t("ticketType")}</TableHead>
                  <TableHead className="text-right font-lusail">{t("quantity")}</TableHead>
                  <TableHead className="text-right font-lusail">{t("amount")}</TableHead>
                  <TableHead className="text-right font-lusail">{t("status")}</TableHead>
                  <TableHead className="text-right font-lusail">{t("attendance")}</TableHead>
                  <TableHead className="text-right font-lusail">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <p className="text-muted-foreground font-lusail">{t("noBookingsForDate")}</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  bookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="font-mono font-semibold">{booking.booking_reference}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-semibold">{booking.customers.name}</p>
                          <p className="text-xs text-muted-foreground">{booking.customers.phone}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-semibold">{booking.events?.title || 'N/A'}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {booking.ticket_type === "vip" ? t("vipAccess") : 
                           booking.ticket_type === "normal" ? t("generalAdmission") : 
                           t("parking")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold">{booking.quantity}</TableCell>
                      <TableCell className="font-semibold">{booking.total_amount.toFixed(2)} {t("qar")}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={booking.payment_status === "confirmed" ? "default" : booking.payment_status === "failed" ? "destructive" : "secondary"}
                        >
                          {booking.payment_status === "confirmed" ? t("confirmed") :
                           booking.payment_status === "failed" ? t("failed") :
                           t("pending")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {booking.is_present === true ? (
                          <Badge className="bg-green-500">
                            <CheckCircle className="w-3 h-3 ml-1" />
                            {t("present")}
                          </Badge>
                        ) : booking.is_present === false ? (
                          <Badge variant="secondary">
                            <XCircle className="w-3 h-3 ml-1" />
                            {t("absent")}
                          </Badge>
                        ) : (
                          <Badge variant="outline">{t("notMarked")}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={booking.is_present ? "outline" : "default"}
                          onClick={() => togglePresence(booking.id, booking.is_present)}
                          className="font-lusail"
                        >
                          {booking.is_present ? t("markAbsent") : t("markPresent")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LiveBookings;
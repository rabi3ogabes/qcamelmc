import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ticket, Edit, Archive } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EditTicketDialog } from "@/components/admin/EditTicketDialog";

interface TicketType {
  id: string;
  type: string;
  price: number;
  available_quantity: number;
  sold_quantity: number;
  event_id: string;
  description: string | null;
  events?: {
    title: string;
    event_date: string;
    location: string;
    is_archived: boolean;
  };
}

interface DailyBooking {
  date: string;
  ticket_type: string;
  count: number;
  total_amount: number;
}

interface DailySummary {
  date: string;
  event_title: string;
  is_archived: boolean;
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

export const TicketsTab = () => {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [dailyBookings, setDailyBookings] = useState<DailyBooking[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTicket, setEditingTicket] = useState<TicketType | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [view, setView] = useState<"current" | "archived">("current");

  useEffect(() => {
    fetchTickets();
    fetchDailyBookings();
  }, []);

  // Supabase caps every query at 1000 rows; page through everything.
  const fetchAllRows = async <T,>(
    build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
  ): Promise<T[]> => {
    const pageSize = 1000;
    const rows: T[] = [];
    for (let page = 0; page < 60; page++) {
      const from = page * pageSize;
      const { data, error } = await build(from, from + pageSize - 1);
      if (error) throw error;
      const batch = data || [];
      rows.push(...batch);
      if (batch.length < pageSize) break;
    }
    return rows;
  };

  type HolderRow = {
    ticket_type: string;
    orders: { event_id: string; events: { title: string | null; event_date: string; is_archived: boolean } };
  };

  const fetchConfirmedHolders = () =>
    fetchAllRows<HolderRow>((from, to) =>
      supabase
        .from("ticket_holders")
        .select(
          `ticket_type, orders!inner(event_id, payment_status, events!inner(title, event_date, is_archived))`
        )
        .eq("orders.payment_status", "confirmed")
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: HolderRow[] | null; error: unknown }>
    );

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, events(title, event_date, location, is_archived)")
        .order("price", { ascending: false });

      if (error) throw error;

      // Sold quantity = confirmed ticket holders of that type (orders can mix types)
      const holders = await fetchConfirmedHolders();
      const soldMap = new Map<string, number>();
      holders.forEach(h => {
        const key = `${h.orders.event_id}-${h.ticket_type}`;
        soldMap.set(key, (soldMap.get(key) || 0) + 1);
      });

      const ticketsWithCorrectSold = (data || []).map(ticket => ({
        ...ticket,
        sold_quantity: soldMap.get(`${ticket.event_id}-${ticket.type}`) || 0
      }));

      setTickets(ticketsWithCorrectSold);
    } catch (error) {
      toast.error(t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  const fetchDailyBookings = async () => {
    try {
      const { data: ticketPrices, error: ticketError } = await supabase
        .from("tickets")
        .select("event_id, type, price");
      if (ticketError) throw ticketError;

      const priceMap = (ticketPrices || []).reduce((acc, ticket) => {
        acc[`${ticket.event_id}-${ticket.type}`] = Number(ticket.price) || 0;
        return acc;
      }, {} as Record<string, number>);

      const holders = await fetchConfirmedHolders();

      const grouped: Record<string, DailySummary> = {};

      holders.forEach(holder => {
        const date = new Date(holder.orders.events.event_date).toLocaleDateString("en-CA");
        const isArchived = holder.orders.events.is_archived === true;
        const key = `${date}|${isArchived ? "archived" : "current"}`;
        const eventId = holder.orders.event_id;
        const ticketType = holder.ticket_type;
        const price = priceMap[`${eventId}-${ticketType}`] || 0;

        if (!grouped[key]) {
          grouped[key] = {
            date,
            is_archived: isArchived,
            event_title: holder.orders.events.title || "",
            vip_count: 0,
            vip_amount: 0,
            normal_count: 0,
            normal_amount: 0,
            parking_count: 0,
            parking_amount: 0,
            daily_total: 0
          };
        }
        if (!grouped[date].event_title) {
          grouped[date].event_title = holder.orders.events.title || "";
        }

        if (ticketType === "vip") {
          grouped[date].vip_count += 1;
          grouped[date].vip_amount += price;
          grouped[date].vip_price = price || grouped[date].vip_price;
        } else if (ticketType === "normal") {
          grouped[date].normal_count += 1;
          grouped[date].normal_amount += price;
          grouped[date].normal_price = price || grouped[date].normal_price;
        } else if (ticketType === "parking") {
          grouped[date].parking_count += 1;
          grouped[date].parking_amount += price;
          grouped[date].parking_price = price || grouped[date].parking_price;
        }
        grouped[date].daily_total += price;
      });

      const summariesArray = Object.values(grouped).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      setDailySummaries(summariesArray);
    } catch (error) {
      console.error("Error fetching daily bookings:", error);
    }
  };




  if (loading) {
    return <div className="text-center py-12 font-lusail">{t("loading")}</div>;
  }

  const getTicketTypeName = (type: string) => {
    switch(type) {
      case "vip": return t("vipAccess");
      case "normal": return t("generalAdmission");
      case "parking": return t("parking");
      default: return type;
    }
  };

  const getAvailabilityColor = (available: number, sold: number) => {
    const percentage = (sold / (available + sold)) * 100;
    if (percentage >= 90) return "text-red-600";
    if (percentage >= 70) return "text-yellow-600";
    return "text-green-600";
  };

  const handleEditTicket = (ticket: TicketType) => {
    setEditingTicket(ticket);
    setEditDialogOpen(true);
  };

  const handleTicketUpdated = () => {
    fetchTickets();
  };

  // Group tickets by event date (filtered by current/archived view)
  const visibleTickets = tickets.filter((ticket) =>
    view === "archived" ? ticket.events?.is_archived === true : ticket.events?.is_archived !== true
  );
  const ticketsByDate = visibleTickets.reduce((acc, ticket) => {
    if (!ticket.events) return acc;
    const date = ticket.events.event_date;
    if (!acc[date]) {
      acc[date] = {
        date,
        title: ticket.events.title,
        location: ticket.events.location,
        tickets: []
      };
    }
    acc[date].tickets.push(ticket);
    return acc;
  }, {} as Record<string, { date: string; title: string; location: string; tickets: TicketType[] }>);

  const sortedEventDates = Object.values(ticketsByDate).sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Group tickets by type within each event
  const groupTicketsByType = (tickets: TicketType[]) => {
    const vip = tickets.filter(t => t.type === 'vip');
    const normal = tickets.filter(t => t.type === 'normal');
    const parking = tickets.filter(t => t.type === 'parking');
    return { vip, normal, parking };
  };

  const renderTicketCard = (ticket: TicketType) => {
    const remaining = ticket.available_quantity - ticket.sold_quantity;
    const soldPercentage = ((ticket.sold_quantity / ticket.available_quantity) * 100).toFixed(0);
    
    return (
      <Card key={ticket.id} className="p-6 hover:shadow-lg transition-shadow">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Ticket className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-lusail">
                {getTicketTypeName(ticket.type)}
              </h3>
              <p className="text-2xl font-bold text-primary font-lusail">
                {ticket.price.toFixed(2)} {t("qar")}
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => handleEditTicket(ticket)}
            className="shrink-0"
          >
            <Edit className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground font-lusail">{t("available")}</span>
            <span className={`font-bold font-lusail ${getAvailabilityColor(ticket.available_quantity, ticket.sold_quantity)}`}>
              {remaining}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground font-lusail">{t("sold")}</span>
            <span className="font-bold font-lusail">{ticket.sold_quantity}</span>
          </div>
          
          <div className="pt-3 border-t">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-muted-foreground font-lusail">المباع</span>
              <span className="font-semibold font-lusail">{soldPercentage}%</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${soldPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {remaining <= 10 && remaining > 0 && (
          <Badge variant="destructive" className="mt-4 w-full justify-center font-lusail">
            تذاكر محدودة متبقية!
          </Badge>
        )}
        
        {remaining === 0 && (
          <Badge variant="secondary" className="mt-4 w-full justify-center font-lusail">
            نفذت الكمية
          </Badge>
        )}
      </Card>
    );
  };

  // Calculate totals across all dates
  const grandTotals = dailySummaries.reduce((acc, summary) => ({
    vip_count: acc.vip_count + summary.vip_count,
    vip_amount: acc.vip_amount + summary.vip_amount,
    normal_count: acc.normal_count + summary.normal_count,
    normal_amount: acc.normal_amount + summary.normal_amount,
    parking_count: acc.parking_count + summary.parking_count,
    parking_amount: acc.parking_amount + summary.parking_amount,
    daily_total: acc.daily_total + summary.daily_total,
  }), { vip_count: 0, vip_amount: 0, normal_count: 0, normal_amount: 0, parking_count: 0, parking_amount: 0, daily_total: 0 });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-2xl font-bold font-lusail">{t("ticketManagement")}</h2>
        <div className="flex rounded-lg border p-1 bg-muted/40">
          <Button
            variant={view === "current" ? "default" : "ghost"}
            size="sm"
            className="font-lusail"
            onClick={() => setView("current")}
          >
            الحالية
          </Button>
          <Button
            variant={view === "archived" ? "default" : "ghost"}
            size="sm"
            className="font-lusail gap-1"
            onClick={() => setView("archived")}
          >
            <Archive className="w-4 h-4" />
            الأرشيف
          </Button>
        </div>
      </div>

      {/* Daily Sales Statistics Table */}
      {dailySummaries.length > 0 && (
        <Card className="p-6">
          <h3 className="text-xl font-bold font-lusail mb-4">إحصائيات المبيعات اليومية</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2">
                  <th className="text-center p-3 font-lusail font-bold">التاريخ</th>
                  <th colSpan={3} className="text-center p-3 font-lusail font-bold border-x">VIP</th>
                  <th colSpan={3} className="text-center p-3 font-lusail font-bold border-x">عادي</th>
                  <th colSpan={3} className="text-center p-3 font-lusail font-bold border-x">مواقف</th>
                  <th className="text-center p-3 font-lusail font-bold">الإجمالي اليومي</th>
                </tr>
                <tr className="border-b bg-muted/30">
                  <th className="p-2"></th>
                  <th className="text-center p-2 font-lusail text-sm">العدد</th>
                  <th className="text-center p-2 font-lusail text-sm">السعر</th>
                  <th className="text-center p-2 font-lusail text-sm border-l">المبلغ</th>
                  <th className="text-center p-2 font-lusail text-sm">العدد</th>
                  <th className="text-center p-2 font-lusail text-sm">السعر</th>
                  <th className="text-center p-2 font-lusail text-sm border-l">المبلغ</th>
                  <th className="text-center p-2 font-lusail text-sm">العدد</th>
                  <th className="text-center p-2 font-lusail text-sm">السعر</th>
                  <th className="text-center p-2 font-lusail text-sm border-l">المبلغ</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {dailySummaries.map((summary) => (
                  <tr key={summary.date} className="border-b hover:bg-muted/20">
                    <td className="p-3 font-lusail">
                      {new Date(summary.date).toLocaleDateString('en-US', { 
                        weekday: 'long',
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric'
                      })}
                    </td>
                    {/* VIP */}
                    <td className="text-center p-3 font-lusail font-bold">{summary.vip_count || '-'}</td>
                    <td className="text-center p-3 font-lusail">{summary.vip_price ? summary.vip_price.toFixed(2) : '-'}</td>
                    <td className="text-center p-3 font-lusail font-bold text-destructive border-l">{summary.vip_amount > 0 ? summary.vip_amount.toFixed(2) : '-'}</td>
                    {/* Normal */}
                    <td className="text-center p-3 font-lusail font-bold">{summary.normal_count || '-'}</td>
                    <td className="text-center p-3 font-lusail">{summary.normal_price ? summary.normal_price.toFixed(2) : '-'}</td>
                    <td className="text-center p-3 font-lusail font-bold text-destructive border-l">{summary.normal_amount > 0 ? summary.normal_amount.toFixed(2) : '-'}</td>
                    {/* Parking */}
                    <td className="text-center p-3 font-lusail font-bold">{summary.parking_count || '-'}</td>
                    <td className="text-center p-3 font-lusail">{summary.parking_price ? summary.parking_price.toFixed(2) : '-'}</td>
                    <td className="text-center p-3 font-lusail font-bold text-destructive border-l">{summary.parking_amount > 0 ? summary.parking_amount.toFixed(2) : '-'}</td>
                    {/* Daily Total */}
                    <td className="text-center p-3 font-lusail font-bold text-lg text-primary whitespace-nowrap">
                      {summary.daily_total.toFixed(2)} <span className="text-sm">ريال قطري</span>
                    </td>

                  </tr>
                ))}
                {/* Grand Total Row */}
                <tr className="bg-muted/50 font-bold border-t-2">
                  <td className="p-3 font-lusail text-lg">الإجمالي الكلي</td>
                  <td className="text-center p-3 font-lusail text-lg">{grandTotals.vip_count}</td>
                  <td className="text-center p-3 font-lusail">{dailySummaries[0]?.vip_price ? dailySummaries[0].vip_price.toFixed(2) : '-'}</td>
                  <td className="text-center p-3 font-lusail text-lg text-destructive border-l">{grandTotals.vip_amount.toFixed(2)}</td>
                  <td className="text-center p-3 font-lusail text-lg">{grandTotals.normal_count}</td>
                  <td className="text-center p-3 font-lusail">{dailySummaries[0]?.normal_price ? dailySummaries[0].normal_price.toFixed(2) : '-'}</td>
                  <td className="text-center p-3 font-lusail text-lg text-destructive border-l">{grandTotals.normal_amount.toFixed(2)}</td>
                  <td className="text-center p-3 font-lusail text-lg">{grandTotals.parking_count}</td>
                  <td className="text-center p-3 font-lusail">{dailySummaries[0]?.parking_price ? dailySummaries[0].parking_price.toFixed(2) : '-'}</td>
                  <td className="text-center p-3 font-lusail text-lg text-destructive border-l">{grandTotals.parking_amount.toFixed(2)}</td>
                  <td className="text-center p-3 font-lusail text-xl text-primary">
                    {grandTotals.daily_total.toFixed(2)} <span className="text-sm">ريال قطري</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {sortedEventDates.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground font-lusail">لا توجد تذاكر</p>
        </Card>
      ) : (
        <Tabs defaultValue={sortedEventDates[0]?.date} className="w-full">
          <TabsList className="w-full justify-start flex-wrap h-auto">
            {sortedEventDates.map((event) => (
              <TabsTrigger key={event.date} value={event.date} className="font-lusail">
                {new Date(event.date).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  weekday: 'long'
                })}
              </TabsTrigger>
            ))}
          </TabsList>

          {sortedEventDates.map((event) => {
            const eventSummary = dailySummaries.find(s => s.date === new Date(event.date).toLocaleDateString('en-CA'));
            const { vip, normal, parking } = groupTicketsByType(event.tickets);

            return (
              <TabsContent key={event.date} value={event.date} className="space-y-6">
                {/* Event Info */}
                <Card className="p-6">
                  <h3 className="text-xl font-bold font-lusail mb-2">{event.title}</h3>
                  <p className="text-muted-foreground font-lusail">{event.location}</p>
                </Card>

                {/* Daily Statistics for this event */}
                {eventSummary && (
                  <Card className="p-6">
                    <h3 className="text-lg font-bold font-lusail mb-4">إحصائيات المبيعات</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 bg-muted/30 rounded-lg">
                        <p className="text-sm text-muted-foreground font-lusail mb-1">VIP</p>
                        <p className="text-2xl font-bold font-lusail">{eventSummary.vip_count}</p>
                        <p className="text-sm text-primary font-lusail mt-1">{eventSummary.vip_amount.toFixed(2)} {t("qar")}</p>
                      </div>
                      <div className="text-center p-4 bg-muted/30 rounded-lg">
                        <p className="text-sm text-muted-foreground font-lusail mb-1">عادي</p>
                        <p className="text-2xl font-bold font-lusail">{eventSummary.normal_count}</p>
                        <p className="text-sm text-primary font-lusail mt-1">{eventSummary.normal_amount.toFixed(2)} {t("qar")}</p>
                      </div>
                      <div className="text-center p-4 bg-muted/30 rounded-lg">
                        <p className="text-sm text-muted-foreground font-lusail mb-1">مواقف</p>
                        <p className="text-2xl font-bold font-lusail">{eventSummary.parking_count}</p>
                        <p className="text-sm text-primary font-lusail mt-1">{eventSummary.parking_amount.toFixed(2)} {t("qar")}</p>
                      </div>
                      <div className="text-center p-4 bg-primary/10 rounded-lg">
                        <p className="text-sm text-muted-foreground font-lusail mb-1">الإجمالي اليومي</p>
                        <p className="text-3xl font-bold text-primary font-lusail">{eventSummary.daily_total.toFixed(2)}</p>
                        <p className="text-sm font-lusail mt-1">{t("qar")}</p>
                      </div>
                    </div>
                  </Card>
                )}

                {/* VIP Tickets */}
                {vip.length > 0 && (
                  <div>
                    <h4 className="text-lg font-bold font-lusail mb-4 flex items-center gap-2">
                      <Badge variant="default" className="font-lusail">VIP</Badge>
                      {getTicketTypeName('vip')}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {vip.map(renderTicketCard)}
                    </div>
                  </div>
                )}

                {/* Normal Tickets */}
                {normal.length > 0 && (
                  <div>
                    <h4 className="text-lg font-bold font-lusail mb-4 flex items-center gap-2">
                      <Badge variant="secondary" className="font-lusail">عادي</Badge>
                      {getTicketTypeName('normal')}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {normal.map(renderTicketCard)}
                    </div>
                  </div>
                )}

                {/* Parking Tickets */}
                {parking.length > 0 && (
                  <div>
                    <h4 className="text-lg font-bold font-lusail mb-4 flex items-center gap-2">
                      <Badge variant="outline" className="font-lusail">مواقف</Badge>
                      {getTicketTypeName('parking')}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {parking.map(renderTicketCard)}
                    </div>
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      <EditTicketDialog
        ticket={editingTicket}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onTicketUpdated={handleTicketUpdated}
      />
    </div>
  );
};

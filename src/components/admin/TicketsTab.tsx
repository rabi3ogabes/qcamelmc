import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ticket, Edit } from "lucide-react";
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

  useEffect(() => {
    fetchTickets();
    fetchDailyBookings();
  }, []);

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, events(title, event_date, location)")
        .order("price", { ascending: false });

      if (error) throw error;
      
      // Fetch confirmed orders to calculate actual sold quantities
      const { data: ordersData } = await supabase
        .from("orders")
        .select("event_id, ticket_type, quantity")
        .eq("payment_status", "confirmed");
      
      // Calculate sold quantities from confirmed orders only
      const ticketsWithCorrectSold = (data || []).map(ticket => {
        const confirmedSales = (ordersData || [])
          .filter(order => 
            order.event_id === ticket.event_id && 
            order.ticket_type === ticket.type
          )
          .reduce((sum, order) => sum + order.quantity, 0);
        
        return {
          ...ticket,
          sold_quantity: confirmedSales
        };
      });
      
      setTickets(ticketsWithCorrectSold);
    } catch (error) {
      toast.error(t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  const fetchDailyBookings = async () => {
    try {
      // Fetch ticket holders with their orders and events (source of truth for mixed ticket types)
      const { data: ticketHolders, error: thError } = await supabase
        .from("ticket_holders")
        .select(`
          id,
          ticket_type,
          order_id,
          orders!inner(
            payment_status,
            event_id,
            events!inner(
              title,
              event_date
            )
          )
        `)
        .eq("orders.payment_status", "confirmed");

      if (thError) throw thError;

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

      // Group by event date and calculate from actual ticket holders
      const grouped = (ticketHolders || []).reduce((acc: Record<string, DailySummary & { vip_price?: number, normal_price?: number, parking_price?: number }>, holder: any) => {
        const eventDate = holder.orders.events.event_date;
        const date = new Date(eventDate).toLocaleDateString('en-CA');
        const eventId = holder.orders.event_id;
        const ticketType = holder.ticket_type;
        
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
      }, {});

      const summariesArray = Object.values(grouped).sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
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

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold font-lusail">{t("ticketManagement")}</h2>

      {/* Daily Bookings Statistics */}
      <Card className="p-6">
        <h3 className="text-xl font-bold font-lusail mb-4">إحصائيات المبيعات اليومية</h3>
        
        {dailySummaries.length === 0 ? (
          <p className="text-muted-foreground text-center py-8 font-lusail">لا توجد حجوزات مؤكدة</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-right py-3 px-4 font-lusail border font-bold" rowSpan={2}>التاريخ</th>
                  <th className="text-center py-3 px-4 font-lusail border font-bold" colSpan={3}>VIP</th>
                  <th className="text-center py-3 px-4 font-lusail border font-bold" colSpan={3}>عادي</th>
                  <th className="text-center py-3 px-4 font-lusail border font-bold" colSpan={3}>مواقف</th>
                  <th className="text-right py-3 px-4 font-lusail border font-bold" rowSpan={2}>الإجمالي اليومي</th>
                </tr>
                <tr className="bg-muted/30">
                  <th className="text-center py-2 px-3 font-lusail border text-sm">العدد</th>
                  <th className="text-center py-2 px-3 font-lusail border text-sm">السعر</th>
                  <th className="text-center py-2 px-3 font-lusail border text-sm">المبلغ</th>
                  <th className="text-center py-2 px-3 font-lusail border text-sm">العدد</th>
                  <th className="text-center py-2 px-3 font-lusail border text-sm">السعر</th>
                  <th className="text-center py-2 px-3 font-lusail border text-sm">المبلغ</th>
                  <th className="text-center py-2 px-3 font-lusail border text-sm">العدد</th>
                  <th className="text-center py-2 px-3 font-lusail border text-sm">السعر</th>
                  <th className="text-center py-2 px-3 font-lusail border text-sm">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {dailySummaries.map((summary, index) => (
                  <tr key={index} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 font-lusail border">
                      {new Date(summary.date).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        weekday: 'long'
                      })}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center font-bold">
                      {summary.vip_count || '-'}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center text-muted-foreground">
                      {summary.vip_price ? `${summary.vip_price.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center text-primary font-semibold">
                      {summary.vip_amount > 0 ? `${summary.vip_amount.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center font-bold">
                      {summary.normal_count || '-'}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center text-muted-foreground">
                      {summary.normal_price ? `${summary.normal_price.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center text-primary font-semibold">
                      {summary.normal_amount > 0 ? `${summary.normal_amount.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center font-bold">
                      {summary.parking_count || '-'}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center text-muted-foreground">
                      {summary.parking_price ? `${summary.parking_price.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center text-primary font-semibold">
                      {summary.parking_amount > 0 ? `${summary.parking_amount.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-right font-bold text-lg text-primary">
                      {summary.daily_total.toFixed(2)} {t("qar")}
                    </td>
                  </tr>
                ))}
                <tr className="bg-primary/10 font-bold">
                  <td className="py-4 px-4 font-lusail border text-right text-lg">
                    الإجمالي الكلي
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg">
                    {dailySummaries.reduce((sum, s) => sum + s.vip_count, 0)}
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg text-muted-foreground">
                    {dailySummaries.length > 0 && dailySummaries[0].vip_price ? dailySummaries[0].vip_price.toFixed(2) : '-'}
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg text-primary">
                    {dailySummaries.reduce((sum, s) => sum + s.vip_amount, 0).toFixed(2)}
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg">
                    {dailySummaries.reduce((sum, s) => sum + s.normal_count, 0)}
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg text-muted-foreground">
                    {dailySummaries.length > 0 && dailySummaries[0].normal_price ? dailySummaries[0].normal_price.toFixed(2) : '-'}
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg text-primary">
                    {dailySummaries.reduce((sum, s) => sum + s.normal_amount, 0).toFixed(2)}
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg">
                    {dailySummaries.reduce((sum, s) => sum + s.parking_count, 0)}
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg text-muted-foreground">
                    {dailySummaries.length > 0 && dailySummaries[0].parking_price ? dailySummaries[0].parking_price.toFixed(2) : '-'}
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg text-primary">
                    {dailySummaries.reduce((sum, s) => sum + s.parking_amount, 0).toFixed(2)}
                  </td>
                  <td className="py-4 px-4 font-lusail border text-right text-xl font-bold text-primary">
                    {dailySummaries.reduce((sum, s) => sum + s.daily_total, 0).toFixed(2)} {t("qar")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Ticket Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tickets.map((ticket) => {
          const remaining = ticket.available_quantity - ticket.sold_quantity;
          const soldPercentage = ((ticket.sold_quantity / ticket.available_quantity) * 100).toFixed(0);
          
          return (
            <Card key={ticket.id} className="p-6 hover:shadow-lg transition-shadow">
              {ticket.events && (
                <div className="mb-4 pb-4 border-b">
                  <h4 className="font-bold text-base font-lusail mb-1">{ticket.events.title}</h4>
                  <p className="text-sm text-muted-foreground font-lusail">
                    {new Date(ticket.events.event_date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground font-lusail mt-1">
                    {ticket.events.location}
                  </p>
                </div>
              )}
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
        })}
      </div>

      <EditTicketDialog
        ticket={editingTicket}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onTicketUpdated={handleTicketUpdated}
      />
    </div>
  );
};

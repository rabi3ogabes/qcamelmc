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
  normal_count: number;
  normal_amount: number;
  parking_count: number;
  parking_amount: number;
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
      const { data, error } = await supabase
        .from("orders")
        .select("created_at, ticket_type, quantity, total_amount, event_id, events(title, event_date)")
        .eq("payment_status", "confirmed")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Group by event date
      const grouped = (data || []).reduce((acc: Record<string, DailySummary>, order) => {
        const eventDate = order.events?.event_date || order.created_at;
        const date = new Date(eventDate).toLocaleDateString('en-CA');
        
        if (!acc[date]) {
          acc[date] = {
            date,
            event_title: order.events?.title || 'Unknown Event',
            vip_count: 0,
            vip_amount: 0,
            normal_count: 0,
            normal_amount: 0,
            parking_count: 0,
            parking_amount: 0,
            daily_total: 0
          };
        }
        
        const amount = parseFloat(order.total_amount.toString());
        
        if (order.ticket_type === 'vip') {
          acc[date].vip_count += order.quantity;
          acc[date].vip_amount += amount;
        } else if (order.ticket_type === 'normal') {
          acc[date].normal_count += order.quantity;
          acc[date].normal_amount += amount;
        } else if (order.ticket_type === 'parking') {
          acc[date].parking_count += order.quantity;
          acc[date].parking_amount += amount;
        }
        
        acc[date].daily_total += amount;
        
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
                  <th className="text-right py-3 px-4 font-lusail border font-bold" rowSpan={2}>الفعالية</th>
                  <th className="text-center py-3 px-4 font-lusail border font-bold" colSpan={2}>VIP</th>
                  <th className="text-center py-3 px-4 font-lusail border font-bold" colSpan={2}>عادي</th>
                  <th className="text-center py-3 px-4 font-lusail border font-bold" colSpan={2}>مواقف</th>
                  <th className="text-right py-3 px-4 font-lusail border font-bold" rowSpan={2}>الإجمالي اليومي</th>
                </tr>
                <tr className="bg-muted/30">
                  <th className="text-center py-2 px-3 font-lusail border text-sm">العدد</th>
                  <th className="text-center py-2 px-3 font-lusail border text-sm">المبلغ</th>
                  <th className="text-center py-2 px-3 font-lusail border text-sm">العدد</th>
                  <th className="text-center py-2 px-3 font-lusail border text-sm">المبلغ</th>
                  <th className="text-center py-2 px-3 font-lusail border text-sm">العدد</th>
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
                    <td className="py-3 px-4 font-lusail border font-semibold">
                      {summary.event_title}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center font-bold">
                      {summary.vip_count || '-'}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center text-primary font-semibold">
                      {summary.vip_amount > 0 ? `${summary.vip_amount.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center font-bold">
                      {summary.normal_count || '-'}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center text-primary font-semibold">
                      {summary.normal_amount > 0 ? `${summary.normal_amount.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-3 px-4 font-lusail border text-center font-bold">
                      {summary.parking_count || '-'}
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
                  <td colSpan={2} className="py-4 px-4 font-lusail border text-right text-lg">
                    الإجمالي الكلي
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg">
                    {dailySummaries.reduce((sum, s) => sum + s.vip_count, 0)}
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg text-primary">
                    {dailySummaries.reduce((sum, s) => sum + s.vip_amount, 0).toFixed(2)}
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg">
                    {dailySummaries.reduce((sum, s) => sum + s.normal_count, 0)}
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg text-primary">
                    {dailySummaries.reduce((sum, s) => sum + s.normal_amount, 0).toFixed(2)}
                  </td>
                  <td className="py-4 px-4 font-lusail border text-center text-lg">
                    {dailySummaries.reduce((sum, s) => sum + s.parking_count, 0)}
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

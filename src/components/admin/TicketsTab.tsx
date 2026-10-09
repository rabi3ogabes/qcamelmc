import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ticket, Edit, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
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

export const TicketsTab = () => {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [dailyBookings, setDailyBookings] = useState<DailyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTicket, setEditingTicket] = useState<TicketType | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [recounting, setRecounting] = useState(false);

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
      setTickets(data || []);
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
        .select("created_at, ticket_type, quantity, total_amount")
        .eq("payment_status", "confirmed")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Group by date and ticket type
      const grouped = (data || []).reduce((acc: Record<string, DailyBooking>, order) => {
        const date = new Date(order.created_at ?? Date.now()).toLocaleDateString('en-CA');
        const key = `${date}-${order.ticket_type}`;
        
        if (!acc[key]) {
          acc[key] = {
            date,
            ticket_type: order.ticket_type,
            count: 0,
            total_amount: 0
          };
        }
        
        acc[key].count += order.quantity;
        acc[key].total_amount += parseFloat(order.total_amount.toString());
        
        return acc;
      }, {});

      const bookingsArray = Object.values(grouped).sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      
      setDailyBookings(bookingsArray);
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

  // available_quantity is the total capacity, so the share sold is sold / capacity
  const getAvailabilityColor = (capacity: number, sold: number) => {
    const percentage = capacity > 0 ? (sold / capacity) * 100 : 100;
    if (percentage >= 90) return "text-red-600";
    if (percentage >= 70) return "text-yellow-600";
    return "text-green-600";
  };

  const handleEditTicket = (ticket: TicketType) => {
    setEditingTicket(ticket);
    setEditDialogOpen(true);
  };

  /** Recompute every "sold" counter from the bookings that really hold seats (fixes historic drift). */
  const handleRecount = async () => {
    setRecounting(true);
    const result = await api.recountStock();
    setRecounting(false);
    if (!result.ok) {
      toast.error(apiErrorMessage(result.error, t));
      return;
    }
    toast.success(result.data > 0 ? `تم تصحيح عدّاد ${result.data} نوع تذكرة` : "عدّادات التذاكر صحيحة بالفعل");
    fetchTickets();
  };

  const handleTicketUpdated = () => {
    fetchTickets();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold font-lusail">{t("ticketManagement")}</h2>
        <Button variant="outline" onClick={handleRecount} disabled={recounting} className="font-lusail" title="يعيد حساب المباع من الحجوزات الفعلية">
          <RefreshCw className={`ml-2 h-4 w-4 ${recounting ? "animate-spin" : ""}`} />
          إعادة حساب المخزون
        </Button>
      </div>

      {/* Daily Bookings Statistics */}
      <Card className="p-6">
        <h3 className="text-xl font-bold font-lusail mb-4">الحجوزات اليومية حسب نوع التذكرة</h3>
        
        {dailyBookings.length === 0 ? (
          <p className="text-muted-foreground text-center py-8 font-lusail">لا توجد حجوزات مؤكدة</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-right py-3 px-4 font-lusail">التاريخ</th>
                  <th className="text-right py-3 px-4 font-lusail">نوع التذكرة</th>
                  <th className="text-right py-3 px-4 font-lusail">عدد التذاكر</th>
                  <th className="text-right py-3 px-4 font-lusail">المبلغ الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {dailyBookings.map((booking, index) => (
                  <tr key={index} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4 font-lusail">
                      {new Date(booking.date).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </td>
                    <td className="py-3 px-4 font-lusail">
                      <Badge variant={booking.ticket_type === 'vip' ? 'default' : 'secondary'}>
                        {getTicketTypeName(booking.ticket_type)}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-lusail font-bold">{booking.count}</td>
                    <td className="py-3 px-4 font-lusail font-bold text-primary">
                      {booking.total_amount.toFixed(2)} {t("qar")}
                    </td>
                  </tr>
                ))}
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

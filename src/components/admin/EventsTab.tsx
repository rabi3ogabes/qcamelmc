import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon, MapPin, Edit, X, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CreateEventDialog } from "./CreateEventDialog";
import { EditEventDialog } from "./EditEventDialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Event {
  id: string;
  title: string;
  description: string;
  event_date: string;
  location: string;
  is_active: boolean;
  image_url: string | null;
  display_order?: number;
  tickets_sold?: { type: string; count: number; max: number }[];
}

export const EventsTab = () => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("display_order", { ascending: true })
        .order("event_date", { ascending: true });

      if (error) throw error;
      
      // Fetch ticket counts by type for each event
      const eventsWithTicketCounts = await Promise.all(
        (data || []).map(async (event) => {
          // Fetch tickets data (max capacity)
          const { data: ticketsData } = await supabase
            .from("tickets")
            .select("type, available_quantity")
            .eq("event_id", event.id);
          
          // Fetch orders data (sold tickets)
          const { data: ordersData } = await supabase
            .from("orders")
            .select("ticket_type, quantity")
            .eq("event_id", event.id)
            .eq("payment_status", "confirmed");
          
          // Group by ticket type and sum quantities
          const ticketsByType = (ordersData || []).reduce((acc: any, order) => {
            const type = order.ticket_type;
            if (!acc[type]) {
              acc[type] = 0;
            }
            acc[type] += order.quantity;
            return acc;
          }, {});
          
          // Combine tickets data with sold counts
          const ticketsSold = (ticketsData || []).map((ticket) => ({
            type: ticket.type,
            count: ticketsByType[ticket.type] || 0,
            max: ticket.available_quantity
          }));
          
          return {
            ...event,
            tickets_sold: ticketsSold
          };
        })
      );
      
      setEvents(eventsWithTicketCounts);
    } catch (error) {
      toast.error(t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  const deleteEvent = async (eventId: string) => {
    try {
      const { error } = await supabase
        .from("events")
        .delete()
        .eq("id", eventId);

      if (error) throw error;
      toast.success(t("deletedSuccessfully"));
      fetchEvents();
    } catch (error) {
      toast.error(t("failedToLoad"));
    }
  };

  const toggleEventStatus = async (eventId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("events")
        .update({ is_active: !currentStatus })
        .eq("id", eventId);

      if (error) throw error;
      toast.success(t("savedSuccessfully"));
      fetchEvents();
    } catch (error) {
      toast.error(t("failedToLoad"));
    }
  };

  if (loading) {
    return <div className="text-center py-12 font-lusail">{t("loading")}</div>;
  }

  const filteredEvents = filterDate
    ? events.filter(event => {
        const eventDate = new Date(event.event_date);
        return (
          eventDate.getFullYear() === filterDate.getFullYear() &&
          eventDate.getMonth() === filterDate.getMonth() &&
          eventDate.getDate() === filterDate.getDate()
        );
      })
    : events;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-center gap-4">
        <h2 className="text-2xl font-bold font-lusail">{t("eventManagement")}</h2>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "font-lusail flex items-center gap-2",
                  !filterDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="w-4 h-4" />
                {filterDate ? format(filterDate, "PPP") : t("filterByDate")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filterDate}
                onSelect={setFilterDate}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          {filterDate && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFilterDate(undefined)}
              className="font-lusail"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          <CreateEventDialog onEventCreated={fetchEvents} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEvents.map((event) => (
          <Card key={event.id} className="overflow-hidden hover:shadow-lg transition-shadow">
            {event.image_url && (
              <img 
                src={event.image_url} 
                alt={event.title}
                className="w-full h-48 object-cover"
              />
            )}
            <div className="p-6">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-lusail">
                    #{event.display_order || 0}
                  </Badge>
                  <h3 className="text-xl font-bold font-lusail">{event.title}</h3>
                </div>
                <Badge variant={event.is_active ? "default" : "secondary"} className="font-lusail">
                  {event.is_active ? t("active") : t("inactive")}
                </Badge>
              </div>
              
              <p className="text-sm text-muted-foreground mb-4 font-lusail line-clamp-2">
                {event.description}
              </p>
              
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="font-lusail">
                    {new Date(event.event_date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="font-lusail">{event.location}</span>
                </div>
                {event.tickets_sold && event.tickets_sold.length > 0 && (
                  <div className="p-3 bg-primary/5 rounded-lg mt-3 space-y-2">
                    <span className="text-sm font-bold font-lusail block mb-2">سعة التذاكر:</span>
                    {event.tickets_sold.map((ticket) => {
                      const percentage = ticket.max > 0 ? (ticket.count / ticket.max) * 100 : 0;
                      const isHighDemand = percentage > 80;
                      const isMediumDemand = percentage > 50 && percentage <= 80;
                      
                      return (
                        <div key={ticket.type} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium font-lusail capitalize">{ticket.type}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground font-lusail">
                                {ticket.count} مباع / {ticket.max} كحد أقصى
                              </span>
                              <Badge 
                                variant={isHighDemand ? "destructive" : isMediumDemand ? "default" : "secondary"} 
                                className="font-lusail font-bold"
                              >
                                {percentage.toFixed(0)}%
                              </Badge>
                            </div>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all ${
                                isHighDemand ? 'bg-destructive' : isMediumDemand ? 'bg-primary' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(percentage, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-sm font-bold font-lusail">الإجمالي:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-lusail">
                          {event.tickets_sold.reduce((sum, t) => sum + t.count, 0)} مباع / {event.tickets_sold.reduce((sum, t) => sum + t.max, 0)} إجمالي
                        </span>
                        <Badge className="font-lusail font-bold">
                          {((event.tickets_sold.reduce((sum, t) => sum + t.count, 0) / event.tickets_sold.reduce((sum, t) => sum + t.max, 0)) * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 font-lusail"
                    onClick={() => {
                      setEditingEvent(event);
                      setEditDialogOpen(true);
                    }}
                  >
                    {t("edit")}
                    <Edit className="w-4 h-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-lusail">حذف الفعالية</AlertDialogTitle>
                        <AlertDialogDescription className="font-lusail">
                          هل أنت متأكد من حذف "{event.title}"؟ لا يمكن التراجع عن هذا الإجراء.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="font-lusail">إلغاء</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => deleteEvent(event.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-lusail"
                        >
                          حذف
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <div className="flex items-center justify-between p-2 border rounded-lg">
                  <Label htmlFor={`active-${event.id}`} className="font-lusail text-sm cursor-pointer">
                    {event.is_active ? t("active") : t("inactive")}
                  </Label>
                  <Switch
                    id={`active-${event.id}`}
                    checked={event.is_active}
                    onCheckedChange={() => toggleEventStatus(event.id, event.is_active)}
                  />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredEvents.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground font-lusail">
            {filterDate ? t("noEventsForDate") : t("noEvents")}
          </p>
        </Card>
      )}

      <EditEventDialog
        event={editingEvent}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onEventUpdated={fetchEvents}
      />
    </div>
  );
};

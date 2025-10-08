import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar, MapPin, Edit } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CreateEventDialog } from "./CreateEventDialog";
import { EditEventDialog } from "./EditEventDialog";

interface Event {
  id: string;
  title: string;
  description: string;
  event_date: string;
  location: string;
  is_active: boolean;
  image_url: string | null;
}

export const EventsTab = () => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      toast.error(t("failedToLoad"));
    } finally {
      setLoading(false);
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold font-lusail">{t("eventManagement")}</h2>
        <CreateEventDialog onEventCreated={fetchEvents} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((event) => (
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
                <h3 className="text-xl font-bold font-lusail">{event.title}</h3>
                <Badge variant={event.is_active ? "default" : "secondary"} className="font-lusail">
                  {event.is_active ? t("active") : t("inactive")}
                </Badge>
              </div>
              
              <p className="text-sm text-muted-foreground mb-4 font-lusail line-clamp-2">
                {event.description}
              </p>
              
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
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
              </div>
              
              <div className="flex flex-col gap-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full font-lusail"
                  onClick={() => {
                    setEditingEvent(event);
                    setEditDialogOpen(true);
                  }}
                >
                  {t("edit")}
                  <Edit className="w-4 h-4" />
                </Button>
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

      {events.length === 0 && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground font-lusail">{t("noEvents")}</p>
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

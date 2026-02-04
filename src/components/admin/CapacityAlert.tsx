import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, TrendingUp, XCircle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TicketCapacity {
  type: string;
  available_quantity: number;
  confirmed_count: number;
  percentage: number;
}

interface CapacityAlertProps {
  eventId?: string;
}

const getTicketTypeName = (type: string) => {
  switch (type) {
    case "vip": return "VIP";
    case "normal": return "عادي";
    case "parking": return "موقف";
    default: return type;
  }
};

export const CapacityAlert = ({ eventId }: CapacityAlertProps) => {
  const [capacities, setCapacities] = useState<TicketCapacity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCapacities = async () => {
    try {
      // Get today's event or specific event
      let targetEventId = eventId;
      
      if (!targetEventId) {
        // Get today's event in Qatar timezone
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
        
        const { data: events } = await supabase
          .from("events")
          .select("id")
          .gte("event_date", startOfDay.toISOString())
          .lte("event_date", endOfDay.toISOString())
          .eq("is_active", true)
          .limit(1);
        
        if (events && events.length > 0) {
          targetEventId = events[0].id;
        }
      }

      if (!targetEventId) {
        setCapacities([]);
        setLoading(false);
        return;
      }

      // Fetch tickets for the event
      const { data: tickets, error: ticketsError } = await supabase
        .from("tickets")
        .select("type, available_quantity")
        .eq("event_id", targetEventId);

      if (ticketsError) throw ticketsError;

      // Fetch confirmed holder counts
      const { data: holders, error: holdersError } = await supabase
        .from("ticket_holders")
        .select("ticket_type, orders!inner(event_id, payment_status)")
        .eq("orders.event_id", targetEventId)
        .eq("orders.payment_status", "confirmed");

      if (holdersError) throw holdersError;

      // Count by type
      const holderCounts: Record<string, number> = {};
      (holders || []).forEach(h => {
        holderCounts[h.ticket_type] = (holderCounts[h.ticket_type] || 0) + 1;
      });

      // Calculate capacities
      const capacityData: TicketCapacity[] = (tickets || []).map(t => {
        const confirmed = holderCounts[t.type] || 0;
        const percentage = t.available_quantity > 0 
          ? Math.round((confirmed / t.available_quantity) * 100) 
          : 0;
        return {
          type: t.type,
          available_quantity: t.available_quantity,
          confirmed_count: confirmed,
          percentage
        };
      });

      setCapacities(capacityData);
    } catch (error) {
      console.error("Error fetching capacity:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCapacities();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('capacity-alerts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ticket_holders' },
        () => fetchCapacities()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        () => fetchCapacities()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  if (loading) return null;

  // Filter tickets by capacity level
  const criticalTickets = capacities.filter(c => c.percentage >= 100);
  const warningTickets = capacities.filter(c => c.percentage >= 90 && c.percentage < 100);
  const nearingTickets = capacities.filter(c => c.percentage >= 80 && c.percentage < 90);
  const normalTickets = capacities.filter(c => c.percentage < 80);

  if (capacities.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 mb-4" dir="rtl">
      {/* Critical: Over capacity */}
      {criticalTickets.length > 0 && (
        <Alert variant="destructive" className="border-red-500 bg-red-50">
          <XCircle className="h-5 w-5" />
          <AlertTitle className="font-bold">تجاوز السعة!</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-2 mt-2">
              {criticalTickets.map(t => (
                <Badge key={t.type} variant="destructive" className="text-sm">
                  {getTicketTypeName(t.type)}: {t.confirmed_count}/{t.available_quantity} ({t.percentage}%)
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Warning: 90%+ capacity */}
      {warningTickets.length > 0 && (
        <Alert className="border-orange-500 bg-orange-50">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          <AlertTitle className="font-bold text-orange-800">تحذير - السعة تقارب الامتلاء (90%+)</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-2 mt-2">
              {warningTickets.map(t => (
                <Badge key={t.type} className="bg-orange-500 text-white text-sm">
                  {getTicketTypeName(t.type)}: {t.confirmed_count}/{t.available_quantity} ({t.percentage}%)
                  <span className="mr-1">- متبقي {t.available_quantity - t.confirmed_count}</span>
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Info: 80%+ capacity */}
      {nearingTickets.length > 0 && (
        <Alert className="border-yellow-500 bg-yellow-50">
          <TrendingUp className="h-5 w-5 text-yellow-600" />
          <AlertTitle className="font-bold text-yellow-800">السعة تقترب (80%+)</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-2 mt-2">
              {nearingTickets.map(t => (
                <Badge key={t.type} className="bg-yellow-500 text-white text-sm">
                  {getTicketTypeName(t.type)}: {t.confirmed_count}/{t.available_quantity} ({t.percentage}%)
                  <span className="mr-1">- متبقي {t.available_quantity - t.confirmed_count}</span>
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Normal: below 80% capacity */}
      {normalTickets.length > 0 && (
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <AlertTitle className="font-bold text-green-800">السعة متاحة</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-2 mt-2">
              {normalTickets.map(t => (
                <Badge key={t.type} className="bg-green-500 text-white text-sm">
                  {getTicketTypeName(t.type)}: {t.confirmed_count}/{t.available_quantity} ({t.percentage}%)
                  <span className="mr-1">- متبقي {t.available_quantity - t.confirmed_count}</span>
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

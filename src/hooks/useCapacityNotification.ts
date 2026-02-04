import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TicketCapacity {
  type: string;
  available_quantity: number;
}

interface CapacityNotification {
  ticketType: string;
  oldCapacity: number;
  newCapacity: number;
  increase: number;
}

export const useCapacityNotification = (eventId: string | null) => {
  const { toast } = useToast();
  const [notification, setNotification] = useState<CapacityNotification | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const previousCapacitiesRef = useRef<Map<string, number>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio on first user interaction
  useEffect(() => {
    // Create audio element for notification sound
    audioRef.current = new Audio();
    // Use a pleasant success/notification chime sound (base64 encoded)
    // This is a clear, pleasant "ding-dong" style notification
    audioRef.current.src = "data:audio/wav;base64,UklGRl9JAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhO0kAAAAAAP7/AgABAAEA/v8CAAIA/f8CAAIA/v8BAAEA//8AAAEA//8AAAEAAAAAAAAAAP//AQAAAP//AQABAP//AQABAP7/AgACAP3/AwACAP3/AwADAP3/AgADAP3/AgAEAPz/AwAEAPv/BAAEAP3/AwADAP7/AgACAP//AQABAP//AQABAP//AAACAP7/AgACAP7/AgACAP7/AgACAP//AQABAP//AQABAAAAAAAAAAEAAAAAAP//AQABAP//AQABAP//AAABAAAAAAABAP//AQABAAAAAAAAAAAA//8BAAEAAAAAAAAA//8BAAEA//8BAAEAAAAAAAAAAAAAAQAAAAEAAAABAAEAAAAAAQABAAEAAQABAAEAAAAAAQABAAEAAQABAAEAAQABAP//AQABAP//AQAAAP//AQAAAP//AAABAAAAAAABAAAAAAABAP//AQABAP//AQABAP//AQABAP//AQABAP//AQABAAAAAQABAAAAAAAAAQABAAEAAQABAP//AAABAP//AQABAP//AAABAP//AAABAP//AQAAAP//AAABAP//AAABAP//AAABAP//AQABAP//AQABAP//AQABAP7/AgACAP7/AQACAP3/AgADAP3/AwADAP3/AwADAP3/AwAEAP3/AwAEAPz/BAAEAP3/AwAEAPz/AwAFAPz/BAAFAP3/AwAFAPz/AwAFAPz/BAAFAP3/AwAEAPz/AwAEAPz/AwAEAPz/AwAEAPz/AgAEAPz/AwAEAPz/AwADAPz/AwADAPz/AwADAPz/AwADAPz/AgADAPz/AgADAPz/AgACAP3/AgACAP3/AgACAP7/AQACAP7/AQABAP//AQABAP//AQABAP//AAABAP//AAABAAAAAAABAAAAAAAA//8BAAEA//8BAAEA//8BAAEA//8BAAEAAAABAAAAAAAAAQABAAEAAQABAAAAAQABAAAAAQABAAAAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAIAAQACAP//AgABAAEAAgABAAIAAgABAAIAAQADAAIAAwACAAIAAwADAAQAAwAEAAMABAAEAAQABAAFAAUABQAFAAYABgAGAAcABwAHAAcACAAIAAkACQAJAAoACgALAAsACwAMAAwADAANAA0ADQANAA4ADgAPAA8ADwAPABAA";
    audioRef.current.volume = 0.7;
    
    return () => {
      if (audioRef.current) {
        audioRef.current = null;
      }
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.log("Audio playback failed:", err);
      });
    }
  }, []);

  const dismissNotification = useCallback(() => {
    setShowNotification(false);
    setNotification(null);
  }, []);

  // Fetch initial capacities
  useEffect(() => {
    if (!eventId) {
      previousCapacitiesRef.current.clear();
      return;
    }

    const fetchInitialCapacities = async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("type, available_quantity")
        .eq("event_id", eventId);

      if (!error && data) {
        const newMap = new Map<string, number>();
        data.forEach(ticket => {
          newMap.set(ticket.type, ticket.available_quantity);
        });
        previousCapacitiesRef.current = newMap;
      }
    };

    fetchInitialCapacities();
  }, [eventId]);

  // Subscribe to capacity changes
  useEffect(() => {
    if (!eventId) return;

    const channel = supabase
      .channel(`capacity-notification-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          filter: `event_id=eq.${eventId}`
        },
        (payload) => {
          const newTicket = payload.new as TicketCapacity & { id: string };
          const oldCapacity = previousCapacitiesRef.current.get(newTicket.type) || 0;
          const newCapacity = newTicket.available_quantity;

          // Only notify if capacity INCREASED
          if (newCapacity > oldCapacity) {
            const increase = newCapacity - oldCapacity;
            
            console.log(`Capacity increased for ${newTicket.type}: ${oldCapacity} -> ${newCapacity} (+${increase})`);
            
            // Update the notification state
            setNotification({
              ticketType: newTicket.type,
              oldCapacity,
              newCapacity,
              increase
            });
            setShowNotification(true);

            // Play sound
            playNotificationSound();

            // Show toast notification
            const typeLabels: Record<string, string> = {
              vip: 'VIP',
              normal: 'عادي',
              parking: 'مواقف'
            };
            
            toast({
              title: "🎉 تذاكر جديدة متاحة!",
              description: `تم إضافة ${increase} تذكرة ${typeLabels[newTicket.type] || newTicket.type} (${newCapacity} إجمالي)`,
              duration: 8000,
            });

            // Auto-dismiss after 10 seconds
            setTimeout(() => {
              setShowNotification(false);
            }, 10000);
          }

          // Update the stored capacity
          previousCapacitiesRef.current.set(newTicket.type, newCapacity);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, playNotificationSound, toast]);

  return {
    notification,
    showNotification,
    dismissNotification
  };
};

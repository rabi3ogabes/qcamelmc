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
    // Use a base64 encoded notification sound (short chime)
    audioRef.current.src = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQ4HU6vj5LJoEQMpns3n5MJ1JAA+ncrq5cN0GQAvjL/n68p/GQAbfK/k7s+NIAA/e6Hh7c+OIQA9cJHc69GOIgBIbYLT59COJQBnaXO/3M2NIQBua2el0cqMGwBtblqVxseLGgBqa1ONwMWMGgBpalGMvcOMGgBma1WOvcGLGgBqbl2Sv7yLHABwdWqZv7eKHgB5hX+fvbCIHwCBlImdvKuGHgCGoJWbu6eDGwCGopOau6eCGQCDn46YuqaAFQB8l4SVuKR/EQByjo6TtqF+DgBljIyRs559DQBhiYuPsZt8DABhh4mOsJl7CwBhhoiNr5h6CwBihoeMrpd5CgBihoeLrZZ4CQBjh4eKrJV3CABkhoeKq5R2BwBlh4eJqpN1BgBmh4eIqZJ0BQBnh4eHqJFzBABoh4eGp5BzAwBph4eFpo9yAgBqh4eEpY5xAQBrh4eDpI1wAABsh4eCo4xvAABth4aBoolv//9uh4aAoYhu//9vh4Z/oIdt//9wh4Z+n4Zt/v9xh4Z9noVs/v9yh4Z8nYRr/v9zh4Z7nINq/f90h4Z6m4Jp/f91h4Z5moFo/f92h4Z4mYBn/P93h4Z3mH9m/P94h4Z2l35l/P95h4Z1lnxk/P96h4Z0lXtj+/97h4ZzlHpi+/98h4ZylHlh+/99h4Zxkndg+v9+h4Zwkndf+v9/h4Zvknde+v+Ah4ZuknZd+v+Bh4Ztknddv/+Ch4ZsknZcv/+Dh4ZrknVbv/+Eh4ZqknRawP+Fh4Zpk3NZwP+Gh4Zok3JYwP+Hh4Znk3FXwP+Ih4Zmk3BWwP+Jh4Zlk29VwP+Kh4ZklG5UwP+Lh4ZjlG1Tv/+Mh4ZilGxSv/+Nh4ZhlGtRv/+Oh4ZglGpQv/+Ph4ZflWhPv/+Qh4ZelWdOv/+Rh4ZdlWZNwP+Sh4ZclWVM";
    audioRef.current.volume = 0.5;
    
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

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getSelectedSound, isSoundMuted, type NotificationSound } from "@/components/admin/NotificationSoundSelector";

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
  const [currentSound, setCurrentSound] = useState<NotificationSound>(getSelectedSound);
  const [muted, setMuted] = useState<boolean>(isSoundMuted);

  // Initialize audio on first user interaction
  useEffect(() => {
    // Create audio element for notification sound
    audioRef.current = new Audio();
    audioRef.current.src = currentSound.url;
    audioRef.current.volume = 1.0;
    
    // Preload the audio
    audioRef.current.load();
    
    return () => {
      if (audioRef.current) {
        audioRef.current = null;
      }
    };
  }, [currentSound.url]);

  // Listen for storage changes to update sound settings
  useEffect(() => {
    const handleStorageChange = () => {
      setCurrentSound(getSelectedSound());
      setMuted(isSoundMuted());
    };

    window.addEventListener("storage", handleStorageChange);
    
    // Also check periodically for same-tab changes
    const interval = setInterval(() => {
      const newSound = getSelectedSound();
      const newMuted = isSoundMuted();
      if (newSound.id !== currentSound.id) {
        setCurrentSound(newSound);
      }
      if (newMuted !== muted) {
        setMuted(newMuted);
      }
    }, 1000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, [currentSound.id, muted]);

  const playNotificationSound = useCallback(() => {
    if (audioRef.current && !muted) {
      audioRef.current.src = currentSound.url;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.log("Audio playback failed:", err);
      });
    }
  }, [currentSound.url, muted]);

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

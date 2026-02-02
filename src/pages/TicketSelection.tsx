import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Crown, Users, Car, ArrowRight, Plus, Minus } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { PopupBanner } from "@/components/PopupBanner";
import { Footer } from "@/components/Footer";
import { isEventExpired } from "@/lib/eventUtils";
import { useSettings } from "@/contexts/SettingsContext";

interface Ticket {
  id: string;
  type: "vip" | "normal" | "parking";
  price: number;
  available_quantity: number;
  sold_quantity: number;
  event_id: string;
  description: string | null;
}

interface TicketSelection {
  ticketId: string;
  type: string;
  quantity: number;
  price: number;
}

interface Event {
  id: string;
  title: string;
  event_date: string;
  location: string;
}

const TicketSelection = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { eventId } = useParams<{ eventId: string }>();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [holderCounts, setHolderCounts] = useState<Record<string, number>>({}); // Actual counts from ticket_holders
  const [event, setEvent] = useState<Event | null>(null);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  const navigate = useNavigate();

  useEffect(() => {
    if (eventId) {
      validateEventAccess();
    }
    fetchSettings();
  }, [eventId]);

  const validateEventAccess = async () => {
    if (!eventId) return;

    try {
      // Get current time in Qatar timezone (GMT+3)
      const qatarTime = toZonedTime(new Date(), "Asia/Qatar");
      const qatarISOString = fromZonedTime(qatarTime, "Asia/Qatar").toISOString();
      
      // Check if the selected event exists and is active
      const { data: selectedEvent, error: eventError } = await supabase
        .from("events")
        .select("id, event_date")
        .eq("id", eventId)
        .eq("is_active", true)
        .maybeSingle();

      if (eventError) throw eventError;

      // If event doesn't exist, redirect to home
      if (!selectedEvent) {
        toast.error("لا يمكن حجز تذاكر لهذا التاريخ");
        navigate("/");
        return;
      }

      // Check if event booking has expired using the utility function
      if (isEventExpired(selectedEvent.event_date)) {
        toast.error("لا يمكن حجز تذاكر لهذا التاريخ");
        navigate("/");
        return;
      }

      // If valid, fetch the event and tickets
      await fetchEvent();
      await fetchTickets();
    } catch (error) {
      console.error("Error validating event access:", error);
      navigate("/");
    }
  };

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("logo_url, header_bg_color")
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    if (data?.logo_url) {
      setLogoUrl(data.logo_url);
    }
    
    if (data?.header_bg_color) {
      setHeaderBgColor(data.header_bg_color);
    }
  };

  const fetchEvent = async () => {
    if (!eventId) return;
    
    try {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, event_date, location")
        .eq("id", eventId)
        .single();

      if (error) throw error;
      setEvent(data);
    } catch (error) {
      console.error("Error fetching event:", error);
      toast.error("Failed to load event details");
    }
  };

  const fetchTickets = async () => {
    if (!eventId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .eq("event_id", eventId)
        .order("price", { ascending: false });

      if (error) throw error;
      
      // Ensure we have exactly 3 ticket types
      if (!data || data.length !== 3) {
        toast.error("هذه الفعالية لا تحتوي على جميع أنواع التذاكر المطلوبة");
      }
      
      setTickets(data || []);
      
      // Fetch actual holder counts
      await fetchHolderCounts(eventId);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      toast.error("Failed to load tickets");
    } finally {
      setLoading(false);
    }
  };

  const fetchHolderCounts = async (eventIdParam: string) => {
    try {
      // Only count confirmed tickets for availability (not pending)
      const { data: activeHolders, error } = await supabase
        .from("ticket_holders")
        .select("ticket_type, orders!inner(event_id, payment_status)")
        .eq("orders.event_id", eventIdParam)
        .eq("orders.payment_status", "confirmed");

      if (error) {
        console.error("Error fetching holder counts:", error);
        return;
      }

      const counts: Record<string, number> = {};
      (activeHolders || []).forEach(holder => {
        const type = holder.ticket_type;
        counts[type] = (counts[type] || 0) + 1;
      });
      
      setHolderCounts(counts);
    } catch (error) {
      console.error("Failed to fetch holder counts:", error);
    }
  };

  const MAX_ADMISSION_TICKETS = 5; // Combined max for VIP + General
  const MAX_TICKETS_PER_TYPE = 5; // Max for parking

  const getAdmissionTicketCount = () => {
    return tickets.reduce((total, ticket) => {
      if (ticket.type === "vip" || ticket.type === "normal") {
        return total + (selections[ticket.id] || 0);
      }
      return total;
    }, 0);
  };

  const handleQuantityChange = (ticketId: string, value: string) => {
    const quantity = parseInt(value) || 0;
    setSelections(prev => ({
      ...prev,
      [ticketId]: Math.max(0, Math.min(MAX_TICKETS_PER_TYPE, quantity))
    }));
  };

  const incrementQuantity = (ticketId: string, ticketType: string, maxAvailable: number) => {
    setSelections(prev => {
      const current = prev[ticketId] || 0;
      
      // Check if we've reached the maximum available
      if (current >= maxAvailable) {
        toast.error("تم الوصول للحد الأقصى من التذاكر المتاحة");
        return prev;
      }
      
      // Check combined limit for VIP and General admission
      if (ticketType === "vip" || ticketType === "normal") {
        const currentAdmissionCount = getAdmissionTicketCount();
        if (currentAdmissionCount >= MAX_ADMISSION_TICKETS) {
          toast.error(t('maxTicketsError'));
          return prev;
        }
      }
      
      const newValue = Math.min(current + 1, MAX_TICKETS_PER_TYPE, maxAvailable);
      return { ...prev, [ticketId]: newValue };
    });
  };

  const decrementQuantity = (ticketId: string) => {
    setSelections(prev => {
      const current = prev[ticketId] || 0;
      const newValue = Math.max(0, current - 1);
      return { ...prev, [ticketId]: newValue };
    });
  };

  const getTicketIcon = (type: string) => {
    switch (type) {
      case "vip":
        return <Crown className="w-8 h-8 text-secondary" />;
      case "normal":
        return <Users className="w-8 h-8 text-primary" />;
      case "parking":
        return <Car className="w-8 h-8 text-accent" />;
      default:
        return null;
    }
  };

  const getTicketTitle = (type: string) => {
    switch (type) {
      case "vip":
        return t('vipAccessTitle');
      case "normal":
        return t('generalAdmissionTitle');
      case "parking":
        return t('parkingPassTitle');
      default:
        return type;
    }
  };

  const getTicketDescription = (ticket: Ticket) => {
    // Use custom description if available, otherwise fall back to translation
    if (ticket.description) {
      return ticket.description;
    }
    
    switch (ticket.type) {
      case "vip":
        return t('vipAccessDesc');
      case "normal":
        return t('generalAdmissionDesc');
      case "parking":
        return t('parkingPassDesc');
      default:
        return "";
    }
  };

  const calculateTotal = () => {
    return tickets.reduce((total, ticket) => {
      const quantity = selections[ticket.id] || 0;
      return total + (ticket.price * quantity);
    }, 0);
  };

  const handleContinue = () => {
    const selectedTickets: TicketSelection[] = tickets
      .filter(ticket => selections[ticket.id] > 0)
      .map(ticket => ({
        ticketId: ticket.id,
        type: ticket.type,
        quantity: selections[ticket.id],
        price: ticket.price
      }));

    if (selectedTickets.length === 0) {
      toast.error(t('selectAtLeastOne'));
      return;
    }

    // Store both ticket selections AND the event ID
    localStorage.setItem("ticketSelection", JSON.stringify(selectedTickets));
    localStorage.setItem("selectedEventId", eventId || "");
    navigate("/checkout");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-lusail">
        <div className="animate-pulse text-lg">{t('loadingTickets')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-lusail" style={{ backgroundColor: '#F5EFE7' }}>
      {/* Popup Banner */}
      <PopupBanner />
      
      {/* Header */}
      <header className="backdrop-blur-sm sticky top-0 z-10 bg-background" style={{ backgroundColor: headerBgColor }}>
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex justify-center items-center">
          {logoUrl && (
            <img 
              src={logoUrl} 
              alt="Logo" 
              className="h-10 sm:h-12 lg:h-[53px] object-contain cursor-pointer" 
              onClick={() => navigate("/")}
            />
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto py-4 sm:py-8 lg:py-12 px-3 sm:px-4 lg:px-6">
        {event && (
          <div className="text-center mb-6 sm:mb-10 lg:mb-12">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3 lg:mb-4 px-2">{event.title}</h1>
            <p className="text-xs sm:text-sm lg:text-base text-muted-foreground mb-2 hidden">
              {format(new Date(event.event_date), "EEEE، d MMMM، yyyy - h:mm a", { locale: ar })}
            </p>
            <p className="text-xs sm:text-sm lg:text-base text-muted-foreground px-2">{event.location}</p>
          </div>
        )}

        <div className="text-center mb-6 sm:mb-8 lg:mb-10">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-2 px-2">{t('selectTicketsTitle')}</h2>
          <p className="text-xs sm:text-sm lg:text-base text-muted-foreground px-2">{t('chooseQuantity')}</p>
        </div>

        <div className="mb-6 sm:mb-8">
          {/* Ticket Selection */}
          <div className="space-y-3 sm:space-y-4 lg:space-y-6 w-full sm:w-[90%] lg:w-[80%] mx-auto">
          {[...tickets].sort((a, b) => {
            const order = { normal: 0, vip: 1, parking: 2 };
            return order[a.type] - order[b.type];
          }).map((ticket) => {
            // Use actual holder counts instead of sold_quantity
            const soldCount = holderCounts[ticket.type] || 0;
            const remainingTickets = ticket.available_quantity - soldCount;
            const isSoldOut = remainingTickets <= 0;
            
            return (
            <Card key={ticket.id} className={`overflow-hidden shadow-md hover:shadow-lg transition-shadow flex flex-col min-h-[160px] sm:min-h-[180px] border-0 ${isSoldOut ? 'opacity-60' : ''}`}>
              {/* Header Banner */}
              <div className="px-3 sm:px-4 py-2 flex items-center justify-center gap-2" style={{ backgroundColor: headerBgColor }}>
                <h3 className="text-sm sm:text-base lg:text-lg font-bold text-white text-center">
                  {getTicketTitle(ticket.type)}
                </h3>
                {isSoldOut && (
                  <span className="bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded-md font-bold">
                    نفذت الكمية
                  </span>
                )}
              </div>
              
              <div className="p-3 sm:p-4 lg:p-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 lg:gap-6 flex-1">
                <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1">
                  <div className="p-2 sm:p-3 lg:p-4 bg-muted rounded-lg shrink-0">
                    {getTicketIcon(ticket.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="mb-2">
                      <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-md text-xs sm:text-sm font-bold">
                        {ticket.type === 'vip' ? 'VIP' : ticket.type === 'normal' ? 'عادي' : 'موقف'}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm lg:text-base text-muted-foreground mb-1.5 sm:mb-2 break-words">
                      {getTicketDescription(ticket)}
                    </p>
                    {isSoldOut && (
                      <p className="text-xs sm:text-sm lg:text-base text-destructive font-bold">
                        نفذت الكمية - غير متوفر
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 sm:space-y-2 lg:space-y-3 sm:text-right">
                  <div className="text-lg sm:text-xl lg:text-2xl font-bold text-primary whitespace-nowrap">
                    {ticket.price.toFixed(2)} {t('qar')}
                  </div>
                  {isSoldOut ? (
                    <div className="text-sm sm:text-base text-destructive font-bold">
                      غير متاح
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
                          onClick={() => decrementQuantity(ticket.id)}
                          disabled={(selections[ticket.id] || 0) === 0}
                        >
                          <Minus className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                        <div className="w-10 sm:w-12 text-center font-semibold text-base sm:text-lg">
                          {selections[ticket.id] || 0}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
                          onClick={() => incrementQuantity(ticket.id, ticket.type, Math.min(remainingTickets, MAX_TICKETS_PER_TYPE))}
                          disabled={
                            (selections[ticket.id] || 0) >= Math.min(remainingTickets, MAX_TICKETS_PER_TYPE) ||
                            ((ticket.type === "vip" || ticket.type === "normal") && getAdmissionTicketCount() >= MAX_ADMISSION_TICKETS)
                          }
                        >
                          <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      </div>
                      <p className="text-[10px] sm:text-xs lg:text-sm text-muted-foreground text-center sm:text-right">
                        {ticket.type === "parking" ? t('maxParkingLabel') : t('maxAdmissionLabel')}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </Card>
            );
          })}
          </div>
        </div>

        <Card className="p-3 sm:p-4 lg:p-6 bg-primary/5 border-primary/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 lg:gap-4 mb-3 sm:mb-4">
            <span className="text-sm sm:text-base lg:text-lg font-semibold">{t('totalAmount')}:</span>
            <span className="text-xl sm:text-2xl lg:text-3xl font-bold text-primary">
              {calculateTotal().toFixed(2)} {t('qar')}
            </span>
          </div>
          <Button 
            size="lg" 
            className="w-full text-sm sm:text-base"
            onClick={handleContinue}
            disabled={calculateTotal() === 0}
          >
            {t('continueToCheckout')}
            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
          </Button>
        </Card>

        {/* 250px spacing between buttons */}
        <div className="text-center" style={{ marginTop: '250px' }}>
          <Button variant="ghost" onClick={() => navigate("/")} className="bg-yellow-500 hover:bg-yellow-600 text-black text-sm sm:text-base px-4 sm:px-6 py-2 sm:py-3">
            {t('backToEvent')}
          </Button>
        </div>
      </div>

      {/* Before Footer Image */}
      {settings?.before_footer_image_url && (
        <div className="relative w-full">
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(245, 239, 231, 0.8), rgba(245, 239, 231, 0.4))' }}
          />
          <img
            src={settings.before_footer_image_url}
            alt="Before Footer"
            className="w-full h-auto object-contain"
            loading="lazy"
          />
        </div>
      )}

      <Footer />
    </div>
  );
};

export default TicketSelection;

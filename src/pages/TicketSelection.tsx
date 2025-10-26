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
import { PopupBanner } from "@/components/PopupBanner";

interface Ticket {
  id: string;
  type: "vip" | "normal" | "parking";
  price: number;
  available_quantity: number;
  sold_quantity: number;
  event_id: string;
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
  const { eventId } = useParams<{ eventId: string }>();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [event, setEvent] = useState<Event | null>(null);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  const navigate = useNavigate();

  useEffect(() => {
    if (eventId) {
      fetchEvent();
      fetchTickets();
    }
    fetchSettings();
  }, [eventId]);

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
    } catch (error) {
      console.error("Error fetching tickets:", error);
      toast.error("Failed to load tickets");
    } finally {
      setLoading(false);
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

  const getTicketDescription = (type: string) => {
    switch (type) {
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

    localStorage.setItem("ticketSelection", JSON.stringify(selectedTickets));
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
    <div className="min-h-screen bg-background font-lusail">
      {/* Popup Banner */}
      <PopupBanner />
      
      {/* Header */}
      <header className="border-b backdrop-blur-sm sticky top-0 z-10 bg-background" style={{ backgroundColor: headerBgColor }}>
        <div className="container mx-auto px-4 py-4 flex justify-center items-center">
          {logoUrl && (
            <img 
              src={logoUrl} 
              alt="Logo" 
              className="h-12 object-contain cursor-pointer" 
              onClick={() => navigate("/")}
            />
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto py-6 sm:py-12 px-4">
        {event && (
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold mb-3 sm:mb-4">{event.title}</h1>
            <p className="text-sm sm:text-base text-muted-foreground mb-2">
              {format(new Date(event.event_date), "EEEE، d MMMM، yyyy - h:mm a", { locale: ar })}
            </p>
            <p className="text-sm sm:text-base text-muted-foreground">{event.location}</p>
          </div>
        )}

        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">{t('selectTicketsTitle')}</h2>
          <p className="text-sm sm:text-base text-muted-foreground">{t('chooseQuantity')}</p>
        </div>

        <div className="space-y-4 sm:space-y-6 mb-6 sm:mb-8">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="p-4 sm:p-6 hover:shadow-lg transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                <div className="flex items-start sm:items-center gap-4 flex-1">
                  <div className="p-3 sm:p-4 bg-muted rounded-lg shrink-0">
                    {getTicketIcon(ticket.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg sm:text-xl font-semibold mb-1">
                      {getTicketTitle(ticket.type)}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                      {getTicketDescription(ticket.type)}
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {t('availableTickets')}: {ticket.available_quantity - ticket.sold_quantity}
                    </p>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 sm:space-y-3 sm:text-right">
                  <div className="text-xl sm:text-2xl font-bold text-primary">
                    {ticket.price.toFixed(2)} {t('qar')}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => decrementQuantity(ticket.id)}
                      disabled={(selections[ticket.id] || 0) === 0}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <div className="w-12 text-center font-semibold text-lg">
                      {selections[ticket.id] || 0}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => incrementQuantity(ticket.id, ticket.type, Math.min(ticket.available_quantity - ticket.sold_quantity, MAX_TICKETS_PER_TYPE))}
                      disabled={
                        (selections[ticket.id] || 0) >= Math.min(ticket.available_quantity - ticket.sold_quantity, MAX_TICKETS_PER_TYPE) ||
                        ((ticket.type === "vip" || ticket.type === "normal") && getAdmissionTicketCount() >= MAX_ADMISSION_TICKETS)
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {ticket.type === "parking" ? t('maxParkingLabel') : t('maxAdmissionLabel')}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-4 sm:p-6 bg-primary/5 border-primary/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
            <span className="text-base sm:text-lg font-semibold">{t('totalAmount')}:</span>
            <span className="text-2xl sm:text-3xl font-bold text-primary">
              {calculateTotal().toFixed(2)} {t('qar')}
            </span>
          </div>
          <Button 
            size="lg" 
            className="w-full"
            onClick={handleContinue}
            disabled={calculateTotal() === 0}
          >
            {t('continueToCheckout')}
            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
          </Button>
        </Card>

        <div className="text-center mt-4 sm:mt-6">
          <Button variant="ghost" onClick={() => navigate("/")} className="bg-yellow-500 hover:bg-yellow-600 text-black">
            {t('backToEvent')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TicketSelection;

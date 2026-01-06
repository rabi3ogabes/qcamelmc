import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, MapPin, Ticket, Lock } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import heroImage from "@/assets/qatar-event-hero.jpg";
import { PopupBanner } from "@/components/PopupBanner";
import { Footer } from "@/components/Footer";
import { useSettings } from "@/contexts/SettingsContext";
import { canPurchaseTickets } from "@/lib/eventUtils";

interface Event {
  id: string;
  title: string;
  description: string;
  event_date: string;
  location: string;
  image_url: string | null;
  start_time: string | null;
  end_time: string | null;
}

const EventHome = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const formatTime12Hour = (time24: string) => {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const isPM = hour >= 12;
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const paddedHour = hour12.toString().padStart(2, '0');
    return `${paddedHour}:${minutes} ${isPM ? 'م' : 'ص'}`;
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      // Fetch all active events
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("is_active", true)
        .order("event_date", { ascending: true })
        .order("display_order", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) throw error;
      
      // Filter out expired events (past 6 PM on event day)
      const availableEvents = (data || []).filter(event => !canPurchaseTickets(event.event_date) ? false : true);
      
      setEvents(availableEvents);
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen font-lusail" style={{ backgroundColor: '#F5EFE7' }}>
      {/* Popup Banner */}
      <PopupBanner />
      
      {/* Header */}
      <header className="border-b backdrop-blur-sm sticky top-0 z-10" style={{ backgroundColor: settings?.header_bg_color || "#D4B78A", borderColor: '#A85740' }}>
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          {settings?.logo_url ? (
            <img 
              src={settings.logo_url} 
              alt="Logo" 
              className="h-[53px] object-contain" 
              loading="eager"
              decoding="async"
            />
          ) : (
            <h1 className="text-2xl font-bold" style={{ color: '#6B4E3D' }}>فعاليات قطر</h1>
          )}
          <div className="flex gap-2">
            <Link to="/live-bookings" className="hidden">
              <Button variant="outline" size="sm" style={{ borderColor: '#A85740', color: '#6B4E3D', backgroundColor: 'transparent' }}>
                <Calendar className="w-4 h-4 ml-2" />
                {t('liveBookings')}
              </Button>
            </Link>
            <Link to="/admin/login" className="hidden">
              <Button variant="outline" size="sm" style={{ borderColor: '#A85740', color: '#6B4E3D', backgroundColor: 'transparent' }}>
                <Lock className="w-4 h-4 ml-2" />
                {t('adminLoginBtn')}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="py-16 px-4">
          <div className="max-w-7xl mx-auto">
            <Skeleton className="h-[70vh] w-full mb-16" />
            <div className="flex flex-wrap justify-center gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-full md:w-[calc(50%-1rem)] lg:w-[calc(33.333%-1.334rem)]">
                  <Skeleton className="h-64 w-full mb-4" />
                  <Skeleton className="h-8 w-3/4 mx-auto mb-2" />
                  <Skeleton className="h-4 w-full mb-4" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : events.length === 0 ? (
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-lg" style={{ color: '#6B4E3D' }}>{t('noActiveEvents')}</p>
        </div>
      ) : (
        <>
          {/* Hero Section */}
          <div className="relative h-[70vh] overflow-hidden">
            <img
              src={settings?.hero_image_url || heroImage}
              alt="Hero Image"
              className="absolute inset-0 w-full h-full object-cover"
              loading="eager"
              decoding="async"
            />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(168, 87, 64, 0.6), rgba(168, 87, 64, 0.4), #F5EFE7)' }} />
            
            <div className="relative h-full flex items-center justify-center px-4">
              {settings?.hero_text && (
                <div className="text-center z-10">
                  <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 mt-12 drop-shadow-lg whitespace-pre-line">
                    {settings.hero_text}
                  </h1>
                </div>
              )}
            </div>
          </div>

          {/* Events Grid */}
          <div className="py-16 px-4">
            <div className="max-w-7xl mx-auto">
              <div className="flex flex-wrap justify-center gap-8">
                {events.map((event) => (
                <Card key={event.id} className="overflow-hidden hover:shadow-2xl transition-shadow flex flex-col w-full md:w-[calc(50%-1rem)] lg:w-[calc(33.333%-1.334rem)]" style={{ backgroundColor: '#FFFFFF', borderColor: '#D4B78A' }}>
                    <div className="h-2" style={{ backgroundColor: settings?.header_bg_color || "#A85740" }} />
                    {event.image_url && (
                      <div className="relative h-64 overflow-hidden">
                        <img 
                          src={event.image_url} 
                          alt={event.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    
                    <div className="p-8 flex-1">
                      <h2 className="text-3xl font-bold mb-4 text-center" style={{ color: '#6B4E3D' }}>{event.title}</h2>
                      <p className="font-bold mb-6 line-clamp-3 text-center" style={{ color: '#6B4E3D' }}>{event.description}</p>
                      
                      <div className="space-y-4">
                        <div className="hidden">
                          <Calendar className="w-5 h-5 text-primary mt-1" />
                          <div>
                            <p className="font-semibold">{t('eventDateTime')}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(event.event_date), "EEEE، d MMMM، yyyy", { locale: ar })}
                            </p>
                          </div>
                        </div>
                        
                        {(event.start_time || event.end_time) && (
                          <div className="flex items-start gap-3">
                            <Calendar className="w-5 h-5 mt-1" style={{ color: '#A85740' }} />
                            <div>
                              <p className="font-semibold" style={{ color: '#6B4E3D' }}>التوقيت</p>
                              <p className="text-sm" style={{ color: '#8B6F47' }}>
                                {event.start_time && `وقت البداية: ${formatTime12Hour(event.start_time)}`}
                                {event.start_time && event.end_time && " | "}
                                {event.end_time && `وقت النهاية: ${formatTime12Hour(event.end_time)}`}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-start gap-3">
                          <MapPin className="w-5 h-5 mt-1" style={{ color: '#A85740' }} />
                          <div>
                            <p className="font-semibold" style={{ color: '#6B4E3D' }}>{t('location')}</p>
                            <p className="text-sm" style={{ color: '#8B6F47' }}>{event.location}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-6 pt-0">
                      {canPurchaseTickets(event.event_date) ? (
                        <Button 
                          className="w-full"
                          size="lg"
                          onClick={() => navigate(`/tickets/${event.id}`)}
                          style={{ backgroundColor: '#A85740', color: '#FFFFFF', border: 'none' }}
                        >
                          <Ticket className="w-5 h-5 ml-2" />
                          {t('bookTicketsNow')}
                        </Button>
                      ) : (
                        <Button 
                          className="w-full"
                          size="lg"
                          disabled
                          style={{ backgroundColor: '#6B4E3D', color: '#FFFFFF', border: 'none', opacity: 0.6 }}
                        >
                          <Lock className="w-5 h-5 ml-2" />
                          انتهى وقت الحجز
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          {/* Before Footer Image */}
          {settings?.before_footer_image_url && (
            <div className="w-full">
              <img
                src={settings.before_footer_image_url}
                alt="Before Footer"
                className="w-full h-auto object-contain"
                loading="lazy"
              />
            </div>
          )}

          <Footer />
        </>
      )}
    </div>
  );
};

export default EventHome;

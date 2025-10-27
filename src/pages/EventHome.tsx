import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, MapPin, Ticket, Lock, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import heroImage from "@/assets/qatar-event-hero.jpg";
import sadadLogo from "@/assets/sadad-logo.png";
import visaLogo from "@/assets/visa-logo.png";
import mastercardLogo from "@/assets/mastercard-logo.png";
import applePayLogo from "@/assets/applepay-logo.png";
import { PopupBanner } from "@/components/PopupBanner";
import { Shield } from "lucide-react";

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
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [headerBgColor, setHeaderBgColor] = useState<string>("hsl(var(--card) / 0.5)");
  const [heroText, setHeroText] = useState<string>("");
  const [copyrightText, setCopyrightText] = useState<string>("جميع الحقوق محفوظة");
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
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("settings")
      .select("logo_url, hero_image_url, header_bg_color, hero_text, copyright_text")
      .maybeSingle();

    if (error) {
      console.error("Error fetching settings:", error);
      return;
    }

    if (data?.logo_url) {
      setLogoUrl(data.logo_url);
    }

    if (data?.hero_image_url) {
      setHeroImageUrl(data.hero_image_url);
    }
    
    if (data?.header_bg_color) {
      setHeaderBgColor(data.header_bg_color);
    }

    if (data?.hero_text) {
      setHeroText(data.hero_text);
    }

    if (data?.copyright_text) {
      setCopyrightText(data.copyright_text);
    }
  };

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("is_active", true)
        .gte("event_date", new Date().toISOString())
        .order("display_order", { ascending: true })
        .order("event_date", { ascending: true }); // Nearest date first (top right in RTL)

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-lusail">
      {/* Popup Banner */}
      <PopupBanner />
      
      {/* Header */}
      <header className="border-b backdrop-blur-sm sticky top-0 z-10" style={{ backgroundColor: headerBgColor }}>
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="h-12 object-contain" />
          ) : (
            <h1 className="text-2xl font-bold">فعاليات قطر</h1>
          )}
          <div className="flex gap-2">
            <Link to="/live-bookings">
              <Button variant="outline" size="sm">
                <Calendar className="w-4 h-4 ml-2" />
                {t('liveBookings')}
              </Button>
            </Link>
            <Link to="/admin/login">
              <Button variant="outline" size="sm">
                <Lock className="w-4 h-4 ml-2" />
                {t('adminLoginBtn')}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-pulse text-lg">{t('loadingEvents')}</div>
        </div>
      ) : events.length === 0 ? (
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-lg">{t('noActiveEvents')}</p>
        </div>
      ) : (
        <>
          {/* Hero Section */}
          <div className="relative h-[70vh] overflow-hidden">
            <div 
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${heroImageUrl || heroImage})` }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-background" />
            </div>
            
            <div className="relative h-full flex items-center justify-center px-4">
              {heroText && (
                <div className="text-center z-10">
                  <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 mt-12 drop-shadow-lg whitespace-pre-line">
                    {heroText}
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
                <Card key={event.id} className="overflow-hidden hover:shadow-2xl transition-shadow flex flex-col w-full md:w-[calc(50%-1rem)] lg:w-[calc(33.333%-1.334rem)]">
                    <div className="h-2" style={{ backgroundColor: headerBgColor }} />
                    {event.image_url && (
                      <div className="relative h-64 overflow-hidden">
                        <img 
                          src={event.image_url} 
                          alt={event.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    
                    <div className="p-8 flex-1">
                      <h2 className="text-3xl font-bold mb-4 text-center">{event.title}</h2>
                      <p className="text-foreground font-bold mb-6 line-clamp-3 text-center">{event.description}</p>
                      
                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
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
                            <Calendar className="w-5 h-5 text-primary mt-1" />
                            <div>
                              <p className="font-semibold">التوقيت</p>
                              <p className="text-sm text-muted-foreground">
                                {event.start_time && `وقت البداية: ${formatTime12Hour(event.start_time)}`}
                                {event.start_time && event.end_time && " | "}
                                {event.end_time && `وقت النهاية: ${formatTime12Hour(event.end_time)}`}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-start gap-3">
                          <MapPin className="w-5 h-5 text-primary mt-1" />
                          <div>
                            <p className="font-semibold">{t('location')}</p>
                            <p className="text-sm text-muted-foreground">{event.location}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-6 pt-0">
                      <Button 
                        className="w-full"
                        size="lg"
                        onClick={() => navigate(`/tickets/${event.id}`)}
                      >
                        <Ticket className="w-5 h-5 ml-2" />
                        {t('bookTicketsNow')}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="border-t backdrop-blur-sm mt-16" style={{ backgroundColor: headerBgColor }} dir="rtl">
            <div className="container mx-auto px-4 py-8">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                {/* Copyright */}
                <div className="text-center md:text-right">
                  <p className="text-sm text-white">
                    © {new Date().getFullYear()} {copyrightText}
                  </p>
                </div>

                {/* Payment Security */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-white" />
                    <span className="text-sm font-semibold text-white">دفع آمن ومحمي</span>
                  </div>
                  <div className="h-8 w-px bg-white/30" />
                  
                  {/* Payment Methods */}
                  <div className="flex items-center gap-2">
                    <img 
                      src={visaLogo} 
                      alt="Visa" 
                      className="h-6 object-contain brightness-0 invert"
                    />
                    <img 
                      src={mastercardLogo} 
                      alt="Mastercard" 
                      className="h-6 object-contain"
                    />
                    <img 
                      src={applePayLogo} 
                      alt="Apple Pay" 
                      className="h-6 object-contain brightness-0 invert"
                    />
                    <div className="h-6 w-px bg-white/30 mx-1" />
                    <img 
                      src={sadadLogo} 
                      alt="Sadad Payment" 
                      className="h-8 object-contain"
                    />
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  );
};

export default EventHome;

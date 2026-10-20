import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, MapPin, Ticket, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import heroImage from "@/assets/qatar-event-hero.jpg";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { useSettings } from "@/contexts/SettingsContext";
import { canPurchaseTickets } from "@/lib/eventUtils";
import { toZonedTime } from "date-fns-tz";
import { QATAR_TZ } from "@/lib/qatarTime";
import { PublicHeader } from "@/components/PublicHeader";
import { BeforeFooterImage } from "@/components/BeforeFooterImage";
import heritageDivider from "@/assets/mafareed-divider.webp.asset.json";
import camelHerd from "@/assets/camel-herd.png.asset.json";
import camelHandler from "@/assets/camel-handler.png.asset.json";
import flagBearer from "@/assets/flag-bearer.png.asset.json";
import camelRider from "@/assets/camel-rider.png.asset.json";

// Light background artwork for the ticket cards, cycled across the grid.
// Resolved against the public host so the artwork loads in preview and live alike.
const CDN = "https://www.qcamelmc.org";
const TICKET_ART = [camelHerd, camelHandler, flagBearer, camelRider].map(
  (asset) => new URL(asset.url, CDN).href
);

interface Event {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  location: string;
  image_url: string | null;
  start_time: string | null;
  end_time: string | null;
}

// Keep the public list light, including on small screens.
const EVENTS_PER_PAGE = 9;
const EVENTS_CACHE_KEY = "cached_events";
const EVENTS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

const EventHome = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const navigate = useNavigate();

  // Load cached events immediately
  const cachedEvents = useMemo(() => {
    try {
      const cached = localStorage.getItem(EVENTS_CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < EVENTS_CACHE_TTL) {
          return (data as Event[]).filter(event => canPurchaseTickets(event.event_date));
        }
      }
    } catch {
      // unreadable cache: load fresh
    }
    return null;
  }, []);

  const [events, setEvents] = useState<Event[]>(cachedEvents || []);
  const [loading, setLoading] = useState(!cachedEvents);
  const [currentPage, setCurrentPage] = useState(1);

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

  const fetchEvents = async (retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        // Respect the admin-selected "current event" so customers only ever
        // see the live event; archived events are never exposed.
        const { data: settingsRow } = await supabase
          .from("public_settings")
          .select("current_event_id")
          .maybeSingle();
        const currentEventId = settingsRow?.current_event_id || null;

        let query = supabase
          .from("events")
          .select("*")
          .eq("is_active", true)
          .eq("is_archived", false);

        if (currentEventId) {
          query = query.eq("id", currentEventId);
        }

        const { data, error } = await query
          .order("event_date", { ascending: true })
          .order("display_order", { ascending: true })
          .order("start_time", { ascending: true })
          .abortSignal(controller.signal);

        clearTimeout(timeoutId);
        if (error) throw error;
        
        const availableEvents = (data || []).filter(event => canPurchaseTickets(event.event_date));
        setEvents(availableEvents);
        // Cache for next visit
        try {
          localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
        } catch {
          // storage full or unavailable: the cache is only an optimisation
        }
        setLoading(false);
        return;
      } catch (error) {
        console.error(`Error fetching events (attempt ${attempt}/${retries}):`, error);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="public-site min-h-screen font-lusail" dir="rtl">
      <PublicHeader />
      <main>
        <section className="relative min-h-[440px] overflow-hidden sm:min-h-[600px]" aria-labelledby="festival-title">
          <img src={settings?.hero_image_url || heroImage} alt="فعاليات مهرجان قطر للإبل" className="absolute inset-0 h-full w-full object-cover" loading="eager" decoding="async" />
          <div className="public-hero-shade absolute inset-0" />
          <div className="public-hero-text relative mx-auto flex min-h-[440px] max-w-7xl flex-col justify-end px-5 py-14 sm:min-h-[600px] sm:px-8 sm:py-20">
            <p className="mb-4 text-sm font-semibold">الفعاليات والتذاكر · قطر</p>
            <h1 id="festival-title" className="max-w-3xl text-3xl font-bold leading-tight sm:text-5xl">مهرجان قطر للإبل</h1>
            {settings?.hero_text && <p className="mt-5 max-w-2xl whitespace-pre-line text-lg leading-8">{settings.hero_text}</p>}
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14" aria-labelledby="events-title">
          <div className="mb-8 flex flex-wrap items-center gap-3"><Ticket className="h-6 w-6 public-event-heading" /><h2 id="events-title" className="text-2xl font-bold public-event-heading">الفعاليات المتاحة</h2><img src={new URL(heritageDivider.url, "https://www.qcamelmc.org").href} alt="" aria-hidden="true" className="public-heritage-divider mr-auto" /></div>
          {loading ? <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-label="جار تحميل الفعاليات">{[1,2,3].map(i => <Skeleton key={i} className="h-72 w-full" />)}</div>
          : events.length === 0 ? <div className="border-y border-border py-12 text-center"><Calendar className="mx-auto mb-5 h-9 w-9 text-muted-foreground" /><p className="text-xl font-semibold">{t('noActiveEvents')}</p><p className="mt-3 text-base text-muted-foreground">تُعرض هنا التذاكر عند إتاحة الفعالية القادمة.</p></div>
          : <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {events.slice((currentPage - 1) * EVENTS_PER_PAGE, currentPage * EVENTS_PER_PAGE).map((event, i) => <Card key={event.id} className="relative flex min-w-0 flex-col overflow-hidden border-border bg-card shadow-sm">
                {event.image_url && <img src={event.image_url} alt={event.title} className="aspect-[4/3] w-full object-cover" loading="lazy" decoding="async" />}
                <div className="relative flex flex-1 flex-col p-5 sm:p-6">
                  <img src={TICKET_ART[i % TICKET_ART.length]} alt="" aria-hidden="true" loading="lazy" decoding="async" className="public-ticket-art pointer-events-none absolute inset-x-0 bottom-0 mx-auto h-[94%] w-auto max-w-[98%] object-contain" />
                  <div className="relative z-10 flex flex-1 flex-col text-center">
                    <h3 className="break-words text-2xl font-bold public-event-title">{event.title}</h3>
                    {event.description && <p className="mt-3 line-clamp-3 text-base leading-7 public-ticket-text">{event.description}</p>}
                    <div className="my-6 space-y-3 text-sm public-ticket-text">
                      <p className="flex items-start justify-center gap-2"><Calendar className="h-4 w-4 shrink-0 mt-1" />{format(toZonedTime(event.event_date, QATAR_TZ), "EEEE، d MMMM، yyyy", { locale: ar })}</p>
                      {(event.start_time || event.end_time) && <p>{event.start_time && formatTime12Hour(event.start_time)}{event.start_time && event.end_time && ' – '}{event.end_time && formatTime12Hour(event.end_time)}</p>}
                      <p className="flex items-start justify-center gap-2"><MapPin className="h-4 w-4 shrink-0 mt-1" /><span className="break-words">{event.location}</span></p>
                    </div>
                    <Button className="mt-auto w-full public-event-btn" size="lg" disabled={!canPurchaseTickets(event.event_date)} onClick={() => navigate(`/tickets/${event.id}`)}><Ticket className="ml-2 h-5 w-5" />{canPurchaseTickets(event.event_date) ? t('bookTicketsNow') : 'انتهى وقت الحجز'}</Button>
                  </div>
                </div>
              </Card>)}
            </div>
            {events.length > EVENTS_PER_PAGE && <nav aria-label="صفحات الفعاليات" className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Button variant="outline" aria-label="الصفحة السابقة" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}><ChevronRight className="h-5 w-5" /></Button>
              <span className="text-sm">صفحة {currentPage} من {Math.ceil(events.length / EVENTS_PER_PAGE)}</span>
              <Button variant="outline" aria-label="الصفحة التالية" disabled={currentPage === Math.ceil(events.length / EVENTS_PER_PAGE)} onClick={() => setCurrentPage(p => Math.min(Math.ceil(events.length / EVENTS_PER_PAGE), p + 1))}><ChevronLeft className="h-5 w-5" /></Button>
            </nav>}
          </>}
        </section>
        {settings?.before_footer_image_url && <BeforeFooterImage src={settings.before_footer_image_url} alt="مهرجان قطر للإبل" />}
      </main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
};

export default EventHome;

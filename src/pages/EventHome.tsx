import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, MapPin, Ticket, Lock } from "lucide-react";
import { format } from "date-fns";
import heroImage from "@/assets/qatar-event-hero.jpg";

interface Event {
  id: string;
  title: string;
  description: string;
  event_date: string;
  location: string;
  image_url: string | null;
}

const EventHome = () => {
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchEvent();
  }, []);

  const fetchEvent = async () => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("is_active", true)
        .single();

      if (error) throw error;
      setEvent(data);
    } catch (error) {
      console.error("Error fetching event:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg">No active events available</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Login Button */}
      <div className="absolute top-4 right-4 z-10">
        <Link to="/admin/login">
          <Button variant="outline" size="sm">
            <Lock className="w-4 h-4 mr-2" />
            Admin Login
          </Button>
        </Link>
      </div>

      {/* Hero Section */}
      <div className="relative h-[70vh] overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-background" />
        </div>
        
        <div className="relative h-full flex items-center justify-center px-4">
          <div className="max-w-4xl text-center space-y-6">
            <h1 className="text-5xl md:text-7xl font-bold text-white drop-shadow-2xl animate-in fade-in duration-700">
              {event.title}
            </h1>
            <p className="text-xl md:text-2xl text-white/90 max-w-2xl mx-auto animate-in fade-in duration-700 delay-150">
              {event.description}
            </p>
            <Button 
              size="xl" 
              variant="premium"
              onClick={() => navigate("/tickets")}
              className="animate-in fade-in duration-700 delay-300 mt-8"
            >
              <Ticket className="w-5 h-5" />
              Book Tickets Now
            </Button>
          </div>
        </div>
      </div>

      {/* Event Details Section */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-8">
          <Card className="p-8 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Event Date & Time</h3>
                <p className="text-muted-foreground">
                  {format(new Date(event.event_date), "EEEE, MMMM d, yyyy")}
                </p>
                <p className="text-muted-foreground">
                  {format(new Date(event.event_date), "h:mm a")}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-8 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-secondary/10 rounded-lg">
                <MapPin className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Location</h3>
                <p className="text-muted-foreground">{event.location}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Call to Action */}
        <div className="mt-16 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Join Us?</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Secure your spot at this unforgettable celebration. Choose from VIP, Normal, or Parking tickets.
          </p>
          <Button 
            size="lg" 
            variant="default"
            onClick={() => navigate("/tickets")}
            className="shadow-lg hover:shadow-xl"
          >
            Select Your Tickets
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EventHome;

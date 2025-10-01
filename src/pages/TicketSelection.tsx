import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Crown, Users, Car, ArrowRight } from "lucide-react";

interface Ticket {
  id: string;
  type: "vip" | "normal" | "parking";
  price: number;
  available_quantity: number;
  sold_quantity: number;
}

interface TicketSelection {
  ticketId: string;
  type: string;
  quantity: number;
  price: number;
}

const TicketSelection = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select("*")
        .order("price", { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      toast.error("Failed to load tickets");
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (ticketId: string, value: string) => {
    const quantity = parseInt(value) || 0;
    setSelections(prev => ({
      ...prev,
      [ticketId]: Math.max(0, quantity)
    }));
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
        return "VIP Access";
      case "normal":
        return "General Admission";
      case "parking":
        return "Parking Pass";
      default:
        return type;
    }
  };

  const getTicketDescription = (type: string) => {
    switch (type) {
      case "vip":
        return "Premium seating, exclusive access, complimentary refreshments";
      case "normal":
        return "General admission to all event areas and activities";
      case "parking":
        return "Reserved parking space near the venue entrance";
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
      toast.error("Please select at least one ticket");
      return;
    }

    localStorage.setItem("ticketSelection", JSON.stringify(selectedTickets));
    navigate("/checkout");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading tickets...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Select Your Tickets</h1>
          <p className="text-muted-foreground">Choose the quantity for each ticket type</p>
        </div>

        <div className="space-y-6 mb-8">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-6">
                <div className="p-4 bg-muted rounded-lg">
                  {getTicketIcon(ticket.type)}
                </div>
                
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-1">
                    {getTicketTitle(ticket.type)}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    {getTicketDescription(ticket.type)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Available: {ticket.available_quantity - ticket.sold_quantity}
                  </p>
                </div>

                <div className="text-right space-y-3">
                  <div className="text-2xl font-bold text-primary">
                    {ticket.price.toFixed(2)} QAR
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`qty-${ticket.id}`} className="sr-only">
                      Quantity
                    </Label>
                    <Input
                      id={`qty-${ticket.id}`}
                      type="number"
                      min="0"
                      max={ticket.available_quantity - ticket.sold_quantity}
                      value={selections[ticket.id] || 0}
                      onChange={(e) => handleQuantityChange(ticket.id, e.target.value)}
                      className="w-20 text-center"
                    />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-6 bg-primary/5 border-primary/20">
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-semibold">Total Amount:</span>
            <span className="text-3xl font-bold text-primary">
              {calculateTotal().toFixed(2)} QAR
            </span>
          </div>
          <Button 
            size="lg" 
            className="w-full"
            onClick={handleContinue}
            disabled={calculateTotal() === 0}
          >
            Continue to Checkout
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </Card>

        <div className="text-center mt-6">
          <Button variant="ghost" onClick={() => navigate("/")}>
            ← Back to Event Details
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TicketSelection;

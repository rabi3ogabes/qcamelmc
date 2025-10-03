import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { CreditCard, Banknote, Loader2 } from "lucide-react";

interface TicketSelection {
  ticketId: string;
  type: string;
  quantity: number;
  price: number;
}

interface TicketHolder {
  name: string;
  phone: string;
  nationality: string;
  ticketType: string;
}

const Checkout = () => {
  const [selections, setSelections] = useState<TicketSelection[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"sadad" | "cash_pos">("sadad");
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    email: "",
    phone: ""
  });
  const [ticketHolders, setTicketHolders] = useState<TicketHolder[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem("ticketSelection");
    if (!stored) {
      navigate("/tickets");
      return;
    }
    const parsedSelections = JSON.parse(stored);
    setSelections(parsedSelections);
    
    // Initialize ticket holders array based on total quantity
    const totalTickets = parsedSelections.reduce((total: number, item: TicketSelection) => 
      total + item.quantity, 0);
    
    const holders: TicketHolder[] = [];
    parsedSelections.forEach((selection: TicketSelection) => {
      for (let i = 0; i < selection.quantity; i++) {
        holders.push({
          name: "",
          phone: "",
          nationality: "",
          ticketType: selection.type
        });
      }
    });
    setTicketHolders(holders);
  }, [navigate]);

  const calculateTotal = () => {
    return selections.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);
  };

  const updateTicketHolder = (index: number, field: keyof TicketHolder, value: string) => {
    const updated = [...ticketHolders];
    updated[index] = { ...updated[index], [field]: value };
    setTicketHolders(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!customerInfo.name || !customerInfo.email || !customerInfo.phone) {
      toast.error("Please fill in all customer information");
      return;
    }

    // Validate all ticket holders
    const allHoldersFilled = ticketHolders.every(holder => 
      holder.name && holder.phone && holder.nationality
    );
    
    if (!allHoldersFilled) {
      toast.error("Please fill in information for all ticket holders");
      return;
    }

    setLoading(true);

    try {
      // Create customer
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .insert({
          name: customerInfo.name,
          email: customerInfo.email,
          phone: customerInfo.phone
        })
        .select()
        .single();

      if (customerError) throw customerError;

      // Get event ID
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("id")
        .eq("is_active", true)
        .single();

      if (eventError) throw eventError;

      // Create a single order for all tickets
      const bookingRef = `QTR-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      const totalQuantity = selections.reduce((sum, s) => sum + s.quantity, 0);
      
      const orderData = {
        customer_id: customer.id,
        event_id: event.id,
        ticket_type: selections[0].type as "vip" | "normal" | "parking", // Primary ticket type
        quantity: totalQuantity,
        total_amount: calculateTotal(),
        payment_method: paymentMethod,
        booking_reference: bookingRef,
      };

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert(orderData)
        .select()
        .single();

      if (orderError) throw orderError;

      // Insert all ticket holders
      const holdersToInsert = ticketHolders.map(holder => ({
        order_id: order.id,
        name: holder.name,
        phone: holder.phone,
        nationality: holder.nationality,
        ticket_type: holder.ticketType
      }));

      const { error: holdersError } = await supabase
        .from("ticket_holders")
        .insert(holdersToInsert);

      if (holdersError) throw holdersError;

      // Store order ID for confirmation page
      localStorage.setItem("orderIds", JSON.stringify([order.id]));
      localStorage.removeItem("ticketSelection");

      toast.success("Booking created successfully!");
      navigate("/confirmation");
    } catch (error) {
      console.error("Error creating booking:", error);
      toast.error("Failed to create booking. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (selections.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">Checkout</h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Customer Information */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-6">Booking Contact</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={customerInfo.name}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={customerInfo.email}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={customerInfo.phone}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                    required
                  />
                </div>
              </form>
            </Card>

            {/* Ticket Holders Information */}
            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-6">Ticket Holders Information</h2>
              <div className="space-y-6">
                {ticketHolders.map((holder, index) => (
                  <div key={index} className="p-4 border rounded-lg space-y-4">
                    <h3 className="font-semibold text-lg">
                      Ticket #{index + 1} - {holder.ticketType.toUpperCase()}
                    </h3>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor={`holder-name-${index}`}>Full Name *</Label>
                        <Input
                          id={`holder-name-${index}`}
                          value={holder.name}
                          onChange={(e) => updateTicketHolder(index, 'name', e.target.value)}
                          required
                          placeholder="Enter name"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`holder-phone-${index}`}>Phone Number *</Label>
                        <Input
                          id={`holder-phone-${index}`}
                          type="tel"
                          value={holder.phone}
                          onChange={(e) => updateTicketHolder(index, 'phone', e.target.value)}
                          required
                          placeholder="+974 XXXX XXXX"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`holder-nationality-${index}`}>Nationality *</Label>
                        <Input
                          id={`holder-nationality-${index}`}
                          value={holder.nationality}
                          onChange={(e) => updateTicketHolder(index, 'nationality', e.target.value)}
                          required
                          placeholder="e.g., Qatari"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Payment Method */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Payment Method</h3>
              <RadioGroup value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                <div className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-accent cursor-pointer">
                  <RadioGroupItem value="sadad" id="sadad" />
                  <Label htmlFor="sadad" className="flex items-center gap-2 cursor-pointer flex-1">
                    <CreditCard className="w-5 h-5 text-primary" />
                    <div>
                      <div className="font-medium">Sadad Payment</div>
                      <div className="text-sm text-muted-foreground">Pay online via Sadad</div>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-accent cursor-pointer">
                  <RadioGroupItem value="cash_pos" id="cash_pos" />
                  <Label htmlFor="cash_pos" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Banknote className="w-5 h-5 text-secondary" />
                    <div>
                      <div className="font-medium">Cash / POS at Venue</div>
                      <div className="text-sm text-muted-foreground">Pay when you arrive</div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </Card>

            <Button 
              onClick={handleSubmit} 
              className="w-full" 
              size="lg" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Complete Booking"
              )}
            </Button>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-4">
              <h2 className="text-2xl font-semibold mb-6">Order Summary</h2>
              <div className="space-y-4">
                {selections.map((item, index) => (
                  <div key={index} className="flex justify-between items-center py-3 border-b">
                    <div>
                      <div className="font-medium capitalize">{item.type} Ticket</div>
                      <div className="text-sm text-muted-foreground">Quantity: {item.quantity}</div>
                    </div>
                    <div className="font-semibold">
                      {(item.price * item.quantity).toFixed(2)} QAR
                    </div>
                  </div>
                ))}
                
                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center text-xl font-bold">
                    <span>Total</span>
                    <span className="text-primary">{calculateTotal().toFixed(2)} QAR</span>
                  </div>
                </div>

                <div className="pt-4 text-sm text-muted-foreground">
                  <p>* You will receive a confirmation email after payment is confirmed.</p>
                  <p className="mt-2">* Your tickets with QR codes will be sent to your email.</p>
                </div>
              </div>
            </Card>

            <div className="text-center mt-6">
              <Button variant="ghost" onClick={() => navigate("/tickets")} className="w-full">
                ← Back to Ticket Selection
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
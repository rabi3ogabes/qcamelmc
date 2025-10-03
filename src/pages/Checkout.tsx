import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const [selections, setSelections] = useState<TicketSelection[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"sadad" | "cash_pos">("sadad");
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    email: "",
    phone: "",
    nationality: ""
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

  // Auto-fill first ticket holder from customer info and nationality for all holders
  useEffect(() => {
    if (ticketHolders.length > 0 && customerInfo.name && customerInfo.phone && customerInfo.nationality) {
      const updated = [...ticketHolders];
      // Update first ticket holder with all customer info
      updated[0] = { 
        ...updated[0], 
        name: customerInfo.name, 
        phone: customerInfo.phone,
        nationality: customerInfo.nationality
      };
      // Update all other ticket holders with the same nationality
      for (let i = 1; i < updated.length; i++) {
        updated[i] = {
          ...updated[i],
          nationality: customerInfo.nationality
        };
      }
      setTicketHolders(updated);
    }
  }, [customerInfo.name, customerInfo.phone, customerInfo.nationality]);

  const updateTicketHolder = (index: number, field: keyof TicketHolder, value: string) => {
    const updated = [...ticketHolders];
    updated[index] = { ...updated[index], [field]: value };
    setTicketHolders(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!customerInfo.name || !customerInfo.email || !customerInfo.phone || !customerInfo.nationality) {
      toast.error("Please fill in all customer information");
      return;
    }

    // Validate all ticket holders (first holder needs all fields, others just name and nationality)
    const allHoldersFilled = ticketHolders.every((holder, index) => {
      if (index === 0) {
        return holder.name && holder.phone && holder.nationality;
      }
      return holder.name && holder.nationality;
    });
    
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

      // Insert all ticket holders (use customer phone for additional holders)
      const holdersToInsert = ticketHolders.map(holder => ({
        order_id: order.id,
        name: holder.name,
        phone: holder.phone || customerInfo.phone,
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

      toast.success(t('bookingCreated'));
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
      <div className="min-h-screen flex items-center justify-center font-lusail">
        <div className="animate-pulse text-lg">{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4 font-lusail">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">{t('checkoutTitle')}</h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Customer Information */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-6">{t('customerInfo')}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">{t('fullName')} *</Label>
                  <Input
                    id="name"
                    value={customerInfo.name}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">{t('email')} *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={customerInfo.email}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">{t('phoneNumber')} *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={customerInfo.phone}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="nationality">{t('nationality')} *</Label>
                  <Input
                    id="nationality"
                    value={customerInfo.nationality}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, nationality: e.target.value })}
                    required
                    placeholder={t('nationality')}
                  />
                </div>
              </form>
            </Card>

            {/* Ticket Holders Information */}
            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-6">{t('ticketHolderInfo')}</h2>
              <div className="space-y-6">
                {ticketHolders.map((holder, index) => {
                  // Skip rendering the first ticket holder since info is from customer
                  if (index === 0) return null;
                  
                  return (
                    <div key={index} className="p-4 border rounded-lg space-y-4">
                      <h3 className="font-semibold text-lg">
                        {t('ticket')} #{index + 1} - {holder.ticketType.toUpperCase()}
                      </h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`holder-name-${index}`}>{t('fullName')} *</Label>
                          <Input
                            id={`holder-name-${index}`}
                            value={holder.name}
                            onChange={(e) => updateTicketHolder(index, 'name', e.target.value)}
                            required
                            placeholder={t('fullName')}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`holder-nationality-${index}`}>{t('nationality')} *</Label>
                          <Input
                            id={`holder-nationality-${index}`}
                            value={holder.nationality}
                            onChange={(e) => updateTicketHolder(index, 'nationality', e.target.value)}
                            required
                            placeholder={t('nationality')}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Payment Method */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">{t('selectPaymentMethod')}</h3>
              <RadioGroup value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                <div className="flex items-center space-x-2 space-x-reverse p-4 border rounded-lg hover:bg-accent cursor-pointer">
                  <RadioGroupItem value="sadad" id="sadad" />
                  <Label htmlFor="sadad" className="flex items-center gap-2 cursor-pointer flex-1">
                    <CreditCard className="w-5 h-5 text-primary" />
                    <div>
                      <div className="font-medium">{t('sadadOnline')}</div>
                      <div className="text-sm text-muted-foreground">{t('sadadOnline')}</div>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse p-4 border rounded-lg hover:bg-accent cursor-pointer">
                  <RadioGroupItem value="cash_pos" id="cash_pos" />
                  <Label htmlFor="cash_pos" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Banknote className="w-5 h-5 text-secondary" />
                    <div>
                      <div className="font-medium">{t('cashAtVenue')}</div>
                      <div className="text-sm text-muted-foreground">{t('cashAtVenue')}</div>
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
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  {t('loading')}
                </>
              ) : (
                t('completeBooking')
              )}
            </Button>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-4">
              <h2 className="text-2xl font-semibold mb-6">{t('orderSummary')}</h2>
              <div className="space-y-4">
                {selections.map((item, index) => (
                  <div key={index} className="flex justify-between items-center py-3 border-b">
                    <div>
                      <div className="font-medium capitalize">{item.type} {t('ticket')}</div>
                      <div className="text-sm text-muted-foreground">{t('quantity')}: {item.quantity}</div>
                    </div>
                    <div className="font-semibold">
                      {(item.price * item.quantity).toFixed(2)} {t('qar')}
                    </div>
                  </div>
                ))}
                
                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center text-xl font-bold">
                    <span>{t('totalAmount')}</span>
                    <span className="text-primary">{calculateTotal().toFixed(2)} {t('qar')}</span>
                  </div>
                </div>

                <div className="pt-4 text-sm text-muted-foreground">
                  <p>* {t('receiveEmail')}</p>
                  <p className="mt-2">* {t('presentQR')}</p>
                </div>
              </div>
            </Card>

            <div className="text-center mt-6">
              <Button variant="ghost" onClick={() => navigate("/tickets")} className="w-full">
                {t('backToTickets')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
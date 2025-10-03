import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TicketType {
  id: string;
  type: string;
  price: number;
  available_quantity: number;
  sold_quantity: number;
  event_id: string;
}

export const TicketsTab = () => {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);

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
      toast.error(t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 font-lusail">{t("loading")}</div>;
  }

  const getTicketTypeName = (type: string) => {
    switch(type) {
      case "vip": return t("vipAccess");
      case "normal": return t("generalAdmission");
      case "parking": return t("parking");
      default: return type;
    }
  };

  const getAvailabilityColor = (available: number, sold: number) => {
    const percentage = (sold / (available + sold)) * 100;
    if (percentage >= 90) return "text-red-600";
    if (percentage >= 70) return "text-yellow-600";
    return "text-green-600";
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold font-lusail">{t("ticketManagement")}</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tickets.map((ticket) => {
          const remaining = ticket.available_quantity - ticket.sold_quantity;
          const soldPercentage = ((ticket.sold_quantity / ticket.available_quantity) * 100).toFixed(0);
          
          return (
            <Card key={ticket.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <Ticket className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold font-lusail">
                      {getTicketTypeName(ticket.type)}
                    </h3>
                    <p className="text-2xl font-bold text-primary font-lusail">
                      {ticket.price.toFixed(2)} {t("qar")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground font-lusail">{t("available")}</span>
                  <span className={`font-bold font-lusail ${getAvailabilityColor(ticket.available_quantity, ticket.sold_quantity)}`}>
                    {remaining}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground font-lusail">{t("sold")}</span>
                  <span className="font-bold font-lusail">{ticket.sold_quantity}</span>
                </div>
                
                <div className="pt-3 border-t">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground font-lusail">المباع</span>
                    <span className="font-semibold font-lusail">{soldPercentage}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div 
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${soldPercentage}%` }}
                    />
                  </div>
                </div>
              </div>

              {remaining <= 10 && remaining > 0 && (
                <Badge variant="destructive" className="mt-4 w-full justify-center font-lusail">
                  تذاكر محدودة متبقية!
                </Badge>
              )}
              
              {remaining === 0 && (
                <Badge variant="secondary" className="mt-4 w-full justify-center font-lusail">
                  نفذت الكمية
                </Badge>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

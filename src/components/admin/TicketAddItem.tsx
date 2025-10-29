import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus } from "lucide-react";

interface Ticket {
  id: string;
  type: string;
  price: number;
  available_quantity: number;
  sold_quantity: number;
  event_id: string;
}

interface TicketAddItemProps {
  ticket: Ticket;
  onAddToCart: (ticket: Ticket, quantity: number) => void;
  getTicketTypeName: (type: string) => string;
}

export const TicketAddItem = ({ ticket, onAddToCart, getTicketTypeName }: TicketAddItemProps) => {
  const [tempQty, setTempQty] = useState(1);
  const available = ticket.available_quantity - (ticket.sold_quantity || 0);

  const handleQuantityChange = (value: string) => {
    const num = parseInt(value);
    if (!isNaN(num) && num >= 1 && num <= available) {
      setTempQty(num);
    }
  };

  return (
    <div className="border-2 rounded-lg p-6 bg-card hover:shadow-lg transition-shadow">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex-1">
          <h3 className="text-2xl font-bold mb-2">{getTicketTypeName(ticket.type)}</h3>
          <p className="text-lg font-semibold text-primary">{ticket.price} ريال</p>
          <p className="text-sm text-muted-foreground">المتاح: {available} تذكرة</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 w-12 text-xl"
            onClick={() => setTempQty(Math.max(1, tempQty - 1))}
          >
            <Minus className="w-6 h-6" />
          </Button>
          
          <Input
            type="number"
            min="1"
            max={available}
            value={tempQty}
            onChange={(e) => handleQuantityChange(e.target.value)}
            className="w-20 h-12 text-center text-xl font-bold"
          />
          
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 w-12 text-xl"
            onClick={() => setTempQty(Math.min(available, tempQty + 1))}
          >
            <Plus className="w-6 h-6" />
          </Button>
          
          <Button
            type="button"
            size="lg"
            className="h-12 px-8 text-lg font-bold"
            onClick={() => {
              onAddToCart(ticket, tempQty);
              setTempQty(1);
            }}
            disabled={available === 0}
          >
            إضافة للسلة
          </Button>
        </div>
      </div>
    </div>
  );
};

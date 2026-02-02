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
  actualSoldCount?: number; // Real count from ticket_holders (confirmed only)
}

export const TicketAddItem = ({ ticket, onAddToCart, getTicketTypeName, actualSoldCount }: TicketAddItemProps) => {
  const [tempQty, setTempQty] = useState(1);
  // Use actualSoldCount if provided, otherwise fall back to sold_quantity
  const soldCount = actualSoldCount !== undefined ? actualSoldCount : (ticket.sold_quantity || 0);
  const available = Math.max(0, ticket.available_quantity - soldCount);
  const isSoldOut = available === 0;

  const handleQuantityChange = (value: string) => {
    const num = parseInt(value);
    if (!isNaN(num) && num >= 1 && num <= available) {
      setTempQty(num);
    }
  };

  return (
    <div className={`border-2 rounded-lg p-6 transition-all ${
      isSoldOut 
        ? 'bg-muted/50 opacity-60 cursor-not-allowed' 
        : 'bg-card hover:shadow-lg'
    }`}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex-1">
          <h3 className={`text-2xl font-bold mb-2 ${isSoldOut ? 'text-muted-foreground' : ''}`}>
            {getTicketTypeName(ticket.type)}
            {isSoldOut && <span className="mr-2 text-destructive">(نفذت الكمية)</span>}
          </h3>
          <p className={`text-lg font-semibold ${isSoldOut ? 'text-muted-foreground' : 'text-primary'}`}>
            {ticket.price} ريال
          </p>
          <p className={`text-sm ${isSoldOut ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
            المتاح: {available} تذكرة
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 w-12 text-xl"
            onClick={() => setTempQty(Math.max(1, tempQty - 1))}
            disabled={isSoldOut}
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
            disabled={isSoldOut}
          />
          
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 w-12 text-xl"
            onClick={() => setTempQty(Math.min(available, tempQty + 1))}
            disabled={isSoldOut}
          >
            <Plus className="w-6 h-6" />
          </Button>
          
          <Button
            type="button"
            size="lg"
            className="h-12 px-8 text-lg font-bold"
            onClick={() => {
              console.log("Button clicked! Ticket:", ticket, "Quantity:", tempQty);
              onAddToCart(ticket, tempQty);
              setTempQty(1);
            }}
            disabled={isSoldOut}
          >
            {isSoldOut ? 'نفذت الكمية' : 'إضافة للسلة'}
          </Button>
        </div>
      </div>
    </div>
  );
};

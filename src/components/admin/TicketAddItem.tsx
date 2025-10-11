import { useState } from "react";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="text-lg font-bold">{getTicketTypeName(ticket.type)}</h3>
          <p className="text-sm text-muted-foreground">{ticket.price} ريال</p>
          <p className="text-xs text-muted-foreground">({available} متاح)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setTempQty(Math.max(1, tempQty - 1))}
          >
            <Minus className="w-4 h-4" />
          </Button>
          <span className="w-12 text-center font-bold">{tempQty}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setTempQty(Math.min(available, tempQty + 1))}
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            onClick={() => {
              onAddToCart(ticket, tempQty);
              setTempQty(1);
            }}
            disabled={available === 0}
          >
            إضافة
          </Button>
        </div>
      </div>
    </div>
  );
};

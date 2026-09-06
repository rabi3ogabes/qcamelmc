import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Minus, Crown, Ticket, Car } from "lucide-react";

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

const ticketMeta: Record<string, { icon: typeof Crown; label: string; colorVar: string; gradientVar: string }> = {
  vip: { icon: Crown, label: "VIP", colorVar: "--ticket-vip", gradientVar: "--gradient-gold" },
  normal: { icon: Ticket, label: "عادي", colorVar: "--ticket-normal", gradientVar: "--gradient-primary" },
  parking: { icon: Car, label: "مواقف", colorVar: "--ticket-parking", gradientVar: "--gradient-primary" },
};

export const TicketAddItem = ({ ticket, onAddToCart, getTicketTypeName, actualSoldCount }: TicketAddItemProps) => {
  const [tempQty, setTempQty] = useState(1);
  const soldCount = actualSoldCount !== undefined ? actualSoldCount : (ticket.sold_quantity || 0);
  const available = Math.max(0, ticket.available_quantity - soldCount);
  const isSoldOut = available === 0;

  const meta = ticketMeta[ticket.type] || {
    icon: Ticket,
    label: getTicketTypeName(ticket.type),
    colorVar: "--ticket-normal",
    gradientVar: "--gradient-primary",
  };
  const Icon = meta.icon;
  const accentColor = `hsl(var(${meta.colorVar}))`;

  const handleQuantityChange = (value: string) => {
    const num = parseInt(value);
    if (!isNaN(num) && num >= 1 && num <= available) {
      setTempQty(num);
    }
  };

  const increment = () => setTempQty(Math.min(available, tempQty + 1));
  const decrement = () => setTempQty(Math.max(1, tempQty - 1));

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition-all duration-300 hover:shadow-elegant hover:-translate-y-0.5 ${
        isSoldOut ? "opacity-60 cursor-not-allowed border-destructive/30" : "border-border hover:border-primary/20"
      }`}
      style={{ borderTopWidth: 4, borderTopColor: accentColor }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground shadow-sm"
            style={{ background: `linear-gradient(135deg, ${accentColor}, hsl(var(${meta.colorVar}) / 0.85))` }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className={`text-lg font-bold leading-tight ${isSoldOut ? "text-muted-foreground" : "text-foreground"}`}>
              {getTicketTypeName(ticket.type)}
            </h3>
            <p className={`text-xs font-medium ${isSoldOut ? "text-destructive" : "text-muted-foreground"}`}>
              {isSoldOut ? "نفذت الكمية" : `متاح: ${available} تذكرة`}
            </p>
          </div>
        </div>
        <div className="text-left" dir="ltr">
          <p className="text-2xl font-bold tracking-tight" style={{ color: accentColor }}>
            {ticket.price}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground text-center">ريال</p>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-auto flex items-center gap-2 border-t border-border/60 bg-muted/30 px-4 py-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-lg border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={decrement}
          disabled={isSoldOut || tempQty <= 1}
          aria-label="تقليل الكمية"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <input
          type="number"
          min={1}
          max={available}
          value={tempQty}
          onChange={(e) => handleQuantityChange(e.target.value)}
          disabled={isSoldOut}
          className="h-9 w-14 flex-1 rounded-lg border border-input bg-card text-center text-base font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-lg border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={increment}
          disabled={isSoldOut || tempQty >= available}
          aria-label="زيادة الكمية"
        >
          <Plus className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          className="ms-auto h-9 flex-1 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
          style={{
            background: isSoldOut ? undefined : `linear-gradient(135deg, hsl(var(${meta.colorVar})), hsl(var(${meta.colorVar}) / 0.85))`,
          }}
          onClick={() => {
            onAddToCart(ticket, tempQty);
            setTempQty(1);
          }}
          disabled={isSoldOut}
        >
          {isSoldOut ? "نفذت" : "إضافة"}
        </Button>
      </div>
    </div>
  );
};

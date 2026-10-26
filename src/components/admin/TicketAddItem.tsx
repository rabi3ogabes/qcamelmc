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
  /** How many of this ticket are already in the cart — the stepper edits the cart directly. */
  inCart: number;
  onAddOne: () => void;
  onRemoveOne: () => void;
  getTicketTypeName: (type: string) => string;
  actualSoldCount?: number; // Real count from ticket_holders (confirmed only)
}

const ticketMeta: Record<string, { icon: typeof Crown; label: string; colorVar: string; gradientVar: string }> = {
  vip: { icon: Crown, label: "VIP", colorVar: "--ticket-vip", gradientVar: "--gradient-gold" },
  normal: { icon: Ticket, label: "عادي", colorVar: "--ticket-normal", gradientVar: "--gradient-primary" },
  parking: { icon: Car, label: "مواقف", colorVar: "--ticket-parking", gradientVar: "--gradient-primary" },
};

export const TicketAddItem = ({ ticket, inCart, onAddOne, onRemoveOne, getTicketTypeName, actualSoldCount }: TicketAddItemProps) => {
  const soldCount = actualSoldCount !== undefined ? actualSoldCount : (ticket.sold_quantity || 0);
  const available = Math.max(0, ticket.available_quantity - soldCount);
  const isSoldOut = available === 0;
  const canAddMore = !isSoldOut && inCart < available;

  const meta = ticketMeta[ticket.type] || {
    icon: Ticket,
    label: getTicketTypeName(ticket.type),
    colorVar: "--ticket-normal",
    gradientVar: "--gradient-primary",
  };
  const Icon = meta.icon;
  const accentColor = `hsl(var(${meta.colorVar}))`;

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

      {/* Live cart stepper: every press updates the side cart immediately */}
      <div className="mt-auto flex items-center gap-2 border-t border-border/60 bg-muted/30 px-4 py-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-lg border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={onRemoveOne}
          disabled={isSoldOut || inCart <= 0}
          aria-label="إنقاص تذكرة من السلة"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <div className="flex h-10 flex-1 flex-col items-center justify-center rounded-lg border border-input bg-card" aria-live="polite">
          <span className="text-lg font-bold leading-none tabular-nums" style={{ color: inCart > 0 ? accentColor : undefined }}>
            {inCart}
          </span>
          <span className="text-[10px] text-muted-foreground">في السلة</span>
        </div>

        <Button
          type="button"
          size="icon"
          className="h-10 w-10 rounded-lg text-primary-foreground shadow-sm disabled:opacity-60"
          style={{
            background: canAddMore ? `linear-gradient(135deg, hsl(var(${meta.colorVar})), hsl(var(${meta.colorVar}) / 0.85))` : undefined,
          }}
          onClick={onAddOne}
          disabled={!canAddMore}
          aria-label="إضافة تذكرة إلى السلة"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

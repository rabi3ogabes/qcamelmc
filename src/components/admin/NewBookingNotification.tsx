import { Ticket, CarFront, Crown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CountryFlag } from '@/components/CountryFlag';
import { bookingTicketBreakdown } from '@/lib/bookingNotification';

interface Props {
  nationality: string;
  eventDate: string;
  order: Parameters<typeof bookingTicketBreakdown>[0];
  onDismiss: () => void;
}

export function NewBookingNotification({ nationality, eventDate, order, onDismiss }: Props) {
  const tickets = bookingTicketBreakdown(order);
  const quantity = tickets.reduce((sum, ticket) => sum + ticket.quantity, 0) || order.quantity || 1;
  return (
    <section className="booking-celebration" dir="rtl" aria-label="حجز جديد">
      <div className="booking-fireworks" aria-hidden="true">
        {[0, 1, 2].map(burst => <div className="booking-burst" key={burst}>
          {Array.from({ length: 8 }, (_, ray) => <i key={ray} />)}
        </div>)}
      </div>
      <div className="relative flex items-center gap-3">
        <div className="booking-flag"><CountryFlag nationality={nationality} className="h-7 w-9" /></div>
        <h3 className="flex-1 text-lg font-bold leading-relaxed">حجز جديد من {nationality}</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={onDismiss} aria-label="إغلاق الإشعار" title="إغلاق الإشعار"><X className="h-4 w-4" /></Button>
      </div>
      <p className="relative my-3 text-base font-medium leading-relaxed">🎫 {quantity} تذكرة{eventDate ? ` ليوم ${eventDate}` : ''}</p>
      <div className="relative flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3">
        {tickets.map(({ type, quantity: count }) => {
          const Icon = type === 'vip' ? Crown : type === 'parking' ? CarFront : Ticket;
          const label = type === 'vip' ? 'تذاكر vip' : type === 'parking' ? 'تذاكر مواقف السيارات' : type === 'normal' ? 'تذاكر عادية' : type;
          return <span key={type} className="inline-flex items-center gap-2 text-sm font-semibold"><Icon className="booking-type-icon h-4 w-4" /><span>{label}</span><span className="text-muted-foreground">× {count}</span></span>;
        })}
      </div>
      <div className="booking-toast-progress" aria-hidden="true" />
    </section>
  );
}
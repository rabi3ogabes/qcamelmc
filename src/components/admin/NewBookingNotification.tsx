import { Ticket, CarFront, Crown, X, Store, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CountryFlag } from '@/components/CountryFlag';
import { bookingTicketBreakdown } from '@/lib/bookingNotification';

interface Props {
  nationality: string;
  eventDate: string;
  order: Parameters<typeof bookingTicketBreakdown>[0];
  onDismiss: () => void;
  variant?: 'online' | 'pos';
  customerName?: string;
  staffName?: string;
}

export function NewBookingNotification({ nationality, eventDate, order, onDismiss, variant = 'online', customerName, staffName }: Props) {
  const tickets = bookingTicketBreakdown(order);
  const quantity = tickets.reduce((sum, ticket) => sum + ticket.quantity, 0) || order.quantity || 1;
  return (
    <section className={`booking-celebration${variant === 'pos' ? ' is-pos' : ''}`} dir="rtl" aria-label={variant === 'pos' ? 'تسجيل من نقطة البيع' : 'حجز جديد'}>
      <div className="booking-fireworks" aria-hidden="true">
        {[0, 1, 2].map(burst => <div className="booking-burst" key={burst}>
          {Array.from({ length: 8 }, (_, ray) => <i key={ray} />)}
        </div>)}
      </div>
      <div className="relative flex items-center gap-3">
        <div className="booking-flag"><CountryFlag nationality={nationality} className="h-7 w-9" /></div>
        <div className="min-w-0 flex-1">
          {variant === 'pos' && <p className="booking-kicker inline-flex items-center gap-1.5 text-xs font-bold"><Store className="h-3.5 w-3.5" />تسجيل من نقطة البيع</p>}
          <h3 className="truncate text-lg font-bold leading-relaxed">{variant === 'pos' ? (customerName || 'عميل') : `حجز جديد من ${nationality}`}</h3>
          {variant === 'pos' && <p className="text-xs text-muted-foreground">{nationality}</p>}
        </div>
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
      {variant === 'pos' && staffName && <p className="relative mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><UserRound className="h-3.5 w-3.5" />بواسطة: {staffName}</p>}
      <div className="booking-toast-progress" aria-hidden="true" />
    </section>
  );
}
import { ORDER_FESTIVAL } from '../../supabase/functions/_shared/orders-policy';
import { qatarDayKey } from './qatarTime';

export interface SalesEvent { id: string; event_date: string; title?: string; is_archived?: boolean | null }
export interface DailySummary {
  date: string; event_title: string;
  vip_count: number; vip_amount: number; vip_price?: number;
  normal_count: number; normal_amount: number; normal_price?: number;
  parking_count: number; parking_amount: number; parking_price?: number;
  daily_total: number;
}

/** Completed days remain in this festival's sales report, never earlier seasons. */
export function dailySalesEvents(events: SalesEvent[]): SalesEvent[] {
  return events.filter(event => {
    const day = qatarDayKey(event.event_date);
    return !event.is_archived && day >= ORDER_FESTIVAL.from && day < ORDER_FESTIVAL.toExclusive;
  });
}

export function buildDailySales(
  events: SalesEvent[],
  holders: Array<{ ticket_type: string; orders?: { event_id: string } }>,
  prices: Array<{ event_id: string; type: string; price: number }>,
): DailySummary[] {
  const scope = dailySalesEvents(events);
  const eventMap = new Map(scope.map(event => [event.id, event]));
  const priceMap = new Map(prices.map(ticket => [`${ticket.event_id}-${ticket.type}`, ticket.price]));
  const grouped = new Map<string, DailySummary>();
  for (const event of scope) {
    const date = qatarDayKey(event.event_date);
    if (!grouped.has(date)) grouped.set(date, {
      date, event_title: event.title ?? '', vip_count: 0, vip_amount: 0,
      normal_count: 0, normal_amount: 0, parking_count: 0, parking_amount: 0, daily_total: 0,
    });
  }
  for (const holder of holders) {
    const event = eventMap.get(holder.orders?.event_id ?? '');
    if (!event) continue;
    const summary = grouped.get(qatarDayKey(event.event_date));
    if (!summary) continue;
    const price = priceMap.get(`${event.id}-${holder.ticket_type}`) ?? 0;
    if (holder.ticket_type === 'vip') {
      summary.vip_count++; summary.vip_amount += price; summary.vip_price = price;
    } else if (holder.ticket_type === 'normal') {
      summary.normal_count++; summary.normal_amount += price; summary.normal_price = price;
    } else if (holder.ticket_type === 'parking') {
      summary.parking_count++; summary.parking_amount += price; summary.parking_price = price;
    }
    summary.daily_total += price;
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
}
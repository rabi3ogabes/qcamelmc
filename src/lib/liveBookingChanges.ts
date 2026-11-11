import { qatarDayKey } from "./qatarTime";

export const LIVE_BOOKINGS_REFRESH_MS = 10_000;

/** Live-board attendance: POS sales are present; scanned tickets use holder attendance. */
export function liveBookingAttendance<T extends {
  payment_method: string;
  confirmed_at?: string | null;
  created_at?: string | null;
  ticket_holders?: Array<{ is_present?: boolean | null; confirmed_at?: string | null; created_at?: string | null }> | null;
}>(order: T): T {
  return {
    ...order,
    ticket_holders: order.ticket_holders?.map(holder => ({
      ...holder,
      is_present: order.payment_method === 'cash_pos' || holder.is_present === true,
      // POS attendance starts at sale time; do not invent scanner history for online tickets.
      confirmed_at: order.payment_method === 'cash_pos'
        ? holder.confirmed_at || order.confirmed_at || order.created_at || holder.created_at || null
        : holder.confirmed_at,
    })) ?? [],
  };
}

/** Filter display only; notification snapshots retain every actual festival day. */
export function bookingsForDay<T extends { events: { event_date: string } }>(orders: T[], day: string | null): T[] {
  return day ? orders.filter(order => qatarDayKey(order.events.event_date) === day) : orders;
}

export interface LiveStock {
  id: string;
  event_id: string;
  type: string;
  available_quantity: number;
}

export function stockIncreases(previous: Map<string, number>, current: LiveStock[]) {
  return current.flatMap(ticket => {
    const before = previous.get(ticket.id);
    return before !== undefined && ticket.available_quantity > before
      ? [{ ticketType: ticket.type, increase: ticket.available_quantity - before, newCapacity: ticket.available_quantity }]
      : [];
  });
}

export interface StockAddition {
  ticketType: string;
  increase: number;
  at: number;
}

export const STOCK_ADDITIONS_LIMIT = 20;

/** Newest first; capped so the record list stays small. */
export function appendStockAdditions(
  list: StockAddition[],
  increases: Array<{ ticketType: string; increase: number }>,
  at: number,
): StockAddition[] {
  const entries = increases.map(item => ({ ticketType: item.ticketType, increase: item.increase, at }));
  return [...entries, ...list].slice(0, STOCK_ADDITIONS_LIMIT);
}

export function bookingChanges<T extends { id: string }, H extends { id: string; is_present: boolean }>(
  previousOrders: Set<string>, previousHolders: Map<string, boolean>, orders: T[], holders: H[],
) {
  return {
    bookings: orders.filter(order => !previousOrders.has(order.id)),
    checkins: holders.filter(holder => holder.is_present && previousHolders.get(holder.id) === false),
  };
}
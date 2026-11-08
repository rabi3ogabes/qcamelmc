import { qatarDayKey } from "./qatarTime";

export const LIVE_BOOKINGS_REFRESH_MS = 10_000;

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

export function bookingChanges<T extends { id: string }, H extends { id: string; is_present: boolean }>(
  previousOrders: Set<string>, previousHolders: Map<string, boolean>, orders: T[], holders: H[],
) {
  return {
    bookings: orders.filter(order => !previousOrders.has(order.id)),
    checkins: holders.filter(holder => holder.is_present && previousHolders.get(holder.id) === false),
  };
}
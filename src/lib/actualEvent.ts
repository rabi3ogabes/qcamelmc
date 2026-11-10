import { ORDER_FESTIVAL } from "../../supabase/functions/_shared/orders-policy";
import { qatarDayKey } from "./qatarTime";

export interface ActualEvent {
  id: string;
  event_date: string;
  is_archived?: boolean | null;
}

/**
 * Every active, non-archived day of the current festival belongs on
 * /live-bookings, including completed days. Older seasons never qualify.
 */
export function pickActualEventIds(activeEvents: ActualEvent[]): string[] {
  return (activeEvents ?? [])
    .filter((event) => {
      const day = qatarDayKey(event.event_date);
      return !event.is_archived && day >= ORDER_FESTIVAL.from && day < ORDER_FESTIVAL.toExclusive;
    })
    .map((event) => event.id);
}

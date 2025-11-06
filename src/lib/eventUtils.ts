import { toZonedTime } from "date-fns-tz";

/**
 * Checks if an event has expired (past 6 PM Qatar time on the event date)
 * @param eventDate - The event date string
 * @returns true if the event is expired, false otherwise
 */
export function isEventExpired(eventDate: string): boolean {
  const eventDateTime = toZonedTime(new Date(eventDate), "Asia/Qatar");
  const currentQatarTime = toZonedTime(new Date(), "Asia/Qatar");
  
  // Set cutoff time to 6 PM on the event date
  const cutoffTime = new Date(eventDateTime);
  cutoffTime.setHours(18, 0, 0, 0);
  
  // Check if current Qatar time is past the cutoff
  return currentQatarTime >= cutoffTime;
}

/**
 * Checks if tickets are available for purchase for an event
 * @param eventDate - The event date string
 * @returns true if tickets can be purchased, false otherwise
 */
export function canPurchaseTickets(eventDate: string): boolean {
  return !isEventExpired(eventDate);
}

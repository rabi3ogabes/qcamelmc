import { toZonedTime } from "date-fns-tz";

/**
 * Checks if an event has expired (past 6 PM Qatar time on the event date)
 * @param eventDate - The event date string
 * @returns true if the event is expired, false otherwise
 */
export function isEventExpired(eventDate: string): boolean {
  const eventDateTime = toZonedTime(new Date(eventDate), "Asia/Qatar");
  const currentQatarTime = toZonedTime(new Date(), "Asia/Qatar");
  
  // Extract just the dates (without time) for comparison
  const eventDateOnly = new Date(eventDateTime.getFullYear(), eventDateTime.getMonth(), eventDateTime.getDate());
  const currentDateOnly = new Date(currentQatarTime.getFullYear(), currentQatarTime.getMonth(), currentQatarTime.getDate());
  
  // If event is in the future, not expired
  if (currentDateOnly < eventDateOnly) {
    return false;
  }
  
  // If event date has completely passed (yesterday or earlier), it's expired
  if (currentDateOnly > eventDateOnly) {
    return true;
  }
  
  // If it's the same day, check if it's past 6 PM Qatar time
  const currentHour = currentQatarTime.getHours();
  return currentHour >= 18;
}

/**
 * Checks if tickets are available for purchase for an event
 * @param eventDate - The event date string
 * @returns true if tickets can be purchased, false otherwise
 */
export function canPurchaseTickets(eventDate: string): boolean {
  return !isEventExpired(eventDate);
}

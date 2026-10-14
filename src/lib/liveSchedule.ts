import { qatarDayKey } from "./qatarTime";

export type LiveRefreshMode = "always" | "event_hours";
export const LIVE_START_HOUR = 8;  // 08:00 Qatar
export const LIVE_END_HOUR = 17;   // 17:00 Qatar (exclusive)

/** Qatar hour (0-23) of an instant. */
const qatarHour = (now: Date) => (now.getUTCHours() + 3) % 24;

/**
 * Should live updates run right now?
 * - "always": live whenever there is at least one active event.
 * - "event_hours": live only 08:00–17:00 Qatar on an active event's day.
 * No active event → sleep in both modes.
 */
export function isLiveNow(mode: LiveRefreshMode, eventDates: string[], now: Date = new Date()): boolean {
  if (!eventDates.length) return false;
  if (mode === "always") return true;
  const today = qatarDayKey(now);
  if (!eventDates.some((d) => qatarDayKey(d) === today)) return false;
  const h = qatarHour(now);
  return h >= LIVE_START_HOUR && h < LIVE_END_HOUR;
}

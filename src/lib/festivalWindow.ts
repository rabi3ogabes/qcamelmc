// The festival window: the span of days that still belong to the live season.
//
// A season is several day-events (7 → 14 November 2026). Every day that is not
// archived is part of it, so the window is simply the first such day through
// the last one. Archived seasons (January, February, the October test day)
// fall outside it, and so does anything added after the season ends.

import { qatarDayKey } from "./qatarTime";

export interface FestivalWindowEvent {
  event_date: string;
  is_archived?: boolean | null;
}

export interface FestivalWindow {
  /** Qatar "YYYY-MM-DD" of the first festival day, or null when there is none. */
  from: string | null;
  /** Qatar "YYYY-MM-DD" of the last festival day (inclusive), or null. */
  to: string | null;
  /** Day after `to`, exclusive — the safe upper bound for a date filter. */
  toExclusive: string | null;
}

const EMPTY: FestivalWindow = { from: null, to: null, toExclusive: null };

const dayAfter = (dayKey: string): string => {
  const [year, month, day] = dayKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate()
  ).padStart(2, "0")}`;
};

/** First and last day of the live festival, from the season's own day-events. */
export function festivalDateWindow(
  events: FestivalWindowEvent[] | null | undefined
): FestivalWindow {
  const days = (events ?? [])
    .filter((event) => event && event.event_date && !event.is_archived)
    .map((event) => qatarDayKey(event.event_date))
    .sort();

  if (days.length === 0) return EMPTY;

  const from = days[0];
  const to = days[days.length - 1];
  return { from, to, toExclusive: dayAfter(to) };
}

/** Whether one event date falls inside the festival window. */
export function isFestivalDay(eventDate: string | null | undefined, window: FestivalWindow): boolean {
  if (!eventDate || !window.from || !window.toExclusive) return false;
  const day = qatarDayKey(eventDate);
  return day >= window.from && day < window.toExclusive;
}

/**
 * Picks the "actual" events for the live bookings screen.
 *
 * Rule: every ticket, list and statistic on /live-bookings must come from the
 * actual festival only — never from an older event. A festival spans several
 * day-events, so the scope is a list.
 *
 * 1. The admin's current event (settings.current_event_id) while it is active → only that one.
 * 2. Otherwise every active event that is still viewable (upcoming or today).
 * 3. Empty when nothing qualifies — the page then shows no event data at all.
 */
export function pickActualEventIds(
  activeEvents: { id: string; event_date: string }[],
  currentEventId: string | null | undefined,
  isEventStillViewable: (eventDate: string) => boolean
): string[] {
  const events = activeEvents ?? [];
  if (currentEventId && events.some((e) => e.id === currentEventId)) return [currentEventId];
  return events.filter((e) => isEventStillViewable(e.event_date)).map((e) => e.id);
}

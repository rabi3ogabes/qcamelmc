/**
 * Picks the "actual" event for the live bookings screen.
 *
 * Rule: every ticket, list and statistic on /live-bookings must come from the
 * actual event only — never from an older event.
 *
 * Selection order:
 * 1. The admin's current event (settings.current_event_id) while it is still active.
 * 2. Otherwise the first active event that is still viewable (upcoming or today).
 * 3. null when nothing qualifies — the page then shows no event data at all.
 */
export function pickActualEventId(
  activeEvents: { id: string; event_date: string }[],
  currentEventId: string | null | undefined,
  isEventStillViewable: (eventDate: string) => boolean
): string | null {
  const events = activeEvents ?? [];
  const currentActive =
    currentEventId && events.some((e) => e.id === currentEventId) ? currentEventId : null;
  if (currentActive) return currentActive;
  const upcoming = events.find((e) => isEventStillViewable(e.event_date));
  return upcoming?.id ?? null;
}

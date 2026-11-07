/** Current festival scope; never fall back to archived or inactive events. */
export function scannerEventIds(
  events: { id: string; event_date: string; end_date?: string | null; is_active: boolean | null; is_archived: boolean }[],
  currentEventId: string | null | undefined,
  dayStartUtc: string,
): string[] {
  const active = events.filter(e => e.is_active && !e.is_archived);
  if (currentEventId) return active.filter(e => e.id === currentEventId).map(e => e.id);
  return active.filter(e => (e.end_date || e.event_date) >= dayStartUtc).map(e => e.id);
}

/** Undo admission only; payment, stock and delivery history are unaffected. */
export function cancelledAttendance() {
  return { is_present: false, confirmed_at: null, confirmed_by: null, confirmed_by_name: null };
}
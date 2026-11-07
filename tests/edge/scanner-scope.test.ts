import { describe, expect, it } from 'vitest';
import { scannerEventIds, cancelledAttendance } from '../../supabase/functions/ticket-checkin/scope';

const events = [
  { id: 'old', event_date: '2026-01-12T06:00:00Z', is_active: true, is_archived: true },
  { id: 'past', event_date: '2026-11-06T06:00:00Z', is_active: true, is_archived: false },
  { id: 'nov7', event_date: '2026-11-06T21:00:00Z', is_active: true, is_archived: false },
  { id: 'nov14', event_date: '2026-11-14T06:00:00Z', is_active: true, is_archived: false },
  { id: 'inactive', event_date: '2026-11-07T06:00:00Z', is_active: false, is_archived: false },
];
const start = '2026-11-06T21:00:00Z';
describe('QR scanner current-event scope', () => {
  it('excludes previous events and keeps the active 7–14 November festival', () => {
    expect(scannerEventIds(events, null, start)).toEqual(['nov7', 'nov14']);
  });
  it('honours the single event selected by admin', () => {
    expect(scannerEventIds(events, 'nov7', start)).toEqual(['nov7']);
  });
  it('never falls back to old customers for an archived current event', () => {
    expect(scannerEventIds(events, 'old', start)).toEqual([]);
  });
  it('clears attendance only, without changing payment or delivery', () => {
    const order = { payment_status: 'confirmed', n8n_responded_at: '2026-11-07T08:00:00Z' };
    const holder = { is_present: true, confirmed_at: '2026-11-07T08:30:00Z', confirmed_by: 'admin', confirmed_by_name: 'أسامة' };
    expect({ ...holder, ...cancelledAttendance() }).toEqual({ is_present: false, confirmed_at: null, confirmed_by: null, confirmed_by_name: null });
    expect({ ...order, ...cancelledAttendance() }).toMatchObject(order);
  });
});
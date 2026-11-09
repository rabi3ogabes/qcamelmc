import { describe, expect, it } from 'vitest';
import { buildDailySales, dailySalesEvents } from './liveDailySales';

const events = [
  { id: 'old', event_date: '2026-02-07T06:00:00Z' },
  { id: 'seven', event_date: '2026-11-07T06:00:00Z' },
  { id: 'eight', event_date: '2026-11-08T06:00:00Z' },
  { id: 'duplicate', event_date: '2026-11-07T06:06:00Z', is_archived: true },
  { id: 'last', event_date: '2026-11-14T06:00:00Z' },
  { id: 'after', event_date: '2026-11-15T06:00:00Z' },
];
describe('current festival daily sales', () => {
  it('includes completed 7 and 8 November, excluding previous seasons and archived duplicates', () => {
    expect(dailySalesEvents(events).map(event => event.id)).toEqual(['seven', 'eight', 'last']);
  });
  it('counts actual holder prices on 7 and 8 November, never old-season sales', () => {
    const rows = buildDailySales(events, [
      { ticket_type: 'normal', orders: { event_id: 'seven' } },
      { ticket_type: 'vip', orders: { event_id: 'eight' } },
      { ticket_type: 'normal', orders: { event_id: 'old' } },
    ], [
      { event_id: 'seven', type: 'normal', price: 300 },
      { event_id: 'eight', type: 'vip', price: 500 },
      { event_id: 'old', type: 'normal', price: 999 },
    ]);
    expect(rows.map(row => [row.date, row.daily_total])).toEqual([
      ['2026-11-07', 300], ['2026-11-08', 500], ['2026-11-14', 0],
    ]);
    expect(rows[0].normal_count).toBe(1);
    expect(rows[1].vip_count).toBe(1);
  });
});
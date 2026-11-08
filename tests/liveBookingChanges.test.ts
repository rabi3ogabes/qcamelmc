import { describe, expect, it } from 'vitest';
import { LIVE_BOOKINGS_REFRESH_MS, stockIncreases, bookingChanges } from '../src/lib/liveBookingChanges';

describe('live bookings updates', () => {
  it('refreshes every 10 seconds', () => expect(LIVE_BOOKINGS_REFRESH_MS).toBe(10_000));
  it('reports the exact added stock separately for equal types on different event days', () => {
    expect(stockIncreases(new Map([['day1', 100], ['day2', 200]]), [
      { id: 'day1', event_id: 'one', type: 'normal', available_quantity: 100 },
      { id: 'day2', event_id: 'two', type: 'normal', available_quantity: 207 },
    ])).toEqual([{ ticketType: 'normal', increase: 7, newCapacity: 207 }]);
  });
  it('does not announce initial stock or decreases', () => {
    expect(stockIncreases(new Map([['existing', 10]]), [
      { id: 'new', event_id: 'one', type: 'vip', available_quantity: 20 },
      { id: 'existing', event_id: 'one', type: 'normal', available_quantity: 9 },
    ])).toEqual([]);
  });
  it('detects paid bookings and new attendance once between snapshots', () => {
    const orders = [{ id: 'paid' }, { id: 'newly-confirmed' }];
    const holders = [{ id: 'ticket', is_present: true }];
    expect(bookingChanges(new Set(['paid']), new Map([['ticket', false]]), orders, holders))
      .toEqual({ bookings: [{ id: 'newly-confirmed' }], checkins: holders });
    expect(bookingChanges(new Set(orders.map(o => o.id)), new Map([['ticket', true]]), orders, holders))
      .toEqual({ bookings: [], checkins: [] });
  });
});
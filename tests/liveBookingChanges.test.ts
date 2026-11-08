import { describe, expect, it } from 'vitest';
import { LIVE_BOOKINGS_REFRESH_MS, stockIncreases, bookingChanges, bookingsForDay, liveBookingAttendance, appendStockAdditions } from '../src/lib/liveBookingChanges';

describe('live bookings updates', () => {
  it('always displays POS customers as present, including existing absent or null records', () => {
    const order = { payment_method: 'cash_pos', ticket_holders: [
      { id: 'one', is_present: false }, { id: 'two', is_present: null },
    ] };
    expect(liveBookingAttendance(order).ticket_holders.map(h => h.is_present)).toEqual([true, true]);
    expect(order.ticket_holders[0].is_present).toBe(false);
  });
  it('reflects scanned and cancelled attendance on the next live snapshot', () => {
    const holders = liveBookingAttendance({ payment_method: 'sadad', ticket_holders: [
      { id: 'scanned', is_present: true }, { id: 'not-scanned', is_present: false },
    ] }).ticket_holders;
    expect(holders.map(h => h.is_present)).toEqual([true, false]);
    expect(bookingChanges(new Set(), new Map([['scanned', false]]), [], holders).checkins.map(h => h.id)).toEqual(['scanned']);
    expect(liveBookingAttendance({ payment_method: 'sadad', ticket_holders: [
      { id: 'scanned', is_present: false },
    ] }).ticket_holders[0].is_present).toBe(false);
  });
  it('refreshes every 10 seconds', () => expect(LIVE_BOOKINGS_REFRESH_MS).toBe(10_000));
  it('keeps notifications across festival days while filtering display by Qatar day', () => {
    const orders = [
      { id: 'today', events: { event_date: '2026-11-07T21:00:00Z' } },
      { id: 'later', events: { event_date: '2026-11-14T06:00:00Z' } },
    ];
    expect(bookingsForDay(orders, '2026-11-08').map(o => o.id)).toEqual(['today']);
    expect(bookingChanges(new Set(['today']), new Map(), orders, []).bookings.map(o => o.id)).toEqual(['later']);
    expect(bookingsForDay(orders, null)).toEqual(orders);
  });
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
describe("appendStockAdditions", () => {
  it("prepends new additions with the detection time, newest first", () => {
    const existing = [{ ticketType: "vip", increase: 2, at: 1000 }];
    const result = appendStockAdditions(existing, [{ ticketType: "normal", increase: 5, newCapacity: 50 }], 2000);
    expect(result[0]).toEqual({ ticketType: "normal", increase: 5, at: 2000 });
    expect(result[1]).toEqual({ ticketType: "vip", increase: 2, at: 1000 });
  });

  it("caps the list at the limit", () => {
    let list: ReturnType<typeof appendStockAdditions> = [];
    for (let i = 0; i < 25; i++) {
      list = appendStockAdditions(list, [{ ticketType: "normal", increase: 1, newCapacity: i }], i);
    }
    expect(list).toHaveLength(20);
    expect(list[0].at).toBe(24);
  });
});

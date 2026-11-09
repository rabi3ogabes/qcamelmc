import { describe, expect, it } from 'vitest';
import { bookingTicketBreakdown } from '../src/lib/bookingNotification';

describe('booking notification purchased tickets', () => {
  it('counts actual normal, VIP and parking holders separately', () => {
    expect(bookingTicketBreakdown({ quantity: 99, ticket_holders: [
      { ticket_type: 'normal' }, { ticket_type: 'عادي' }, { ticket_type: 'VIP' }, { ticket_type: 'parking' },
    ] })).toEqual([{ type: 'normal', quantity: 2 }, { type: 'vip', quantity: 1 }, { type: 'parking', quantity: 1 }]);
  });
  it('uses order type and quantity when holders are unavailable', () => {
    expect(bookingTicketBreakdown({ ticket_type: 'vip', quantity: 2 })).toEqual([{ type: 'vip', quantity: 2 }]);
  });
});
import { describe, it, expect } from 'vitest';
import { receiptPrices, receiptSummaryAmounts } from '../../supabase/functions/parse-pos-receipt/pricing';

describe('receipt actual ticket pricing', () => {
  it('uses the selected actual event ticket prices instead of fixed sample amounts', () => {
    const prices = receiptPrices({ id: 'actual', title: 'Festival', event_date: '2026-11-08', tickets: [{ type: 'عادي', price: 75 }, { type: 'VIP', price: 250 }, { type: 'مواقف', price: 40 }] });
    expect(prices).toEqual({ normal: 75, vip: 250, parking: 40 });
    expect(receiptSummaryAmounts({ normal: 2, vip: 1, parking: 3 }, prices)).toEqual({ normal: 150, vip: 250, parking: 120, total: 520 });
  });
  it('does not invent a price when the event or ticket price is missing or ambiguous', () => {
    expect(receiptSummaryAmounts({ normal: 1, vip: 0, parking: 0 }, receiptPrices(undefined)).total).toBeNull();
    expect(receiptPrices({ id: 'a', title: 'a', event_date: '2026-11-08', tickets: [{ type: 'عادي', price: 75 }, { type: 'عادي', price: 100 }] }).normal).toBeNull();
  });
});
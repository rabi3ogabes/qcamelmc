import { describe, expect, it } from 'vitest';
import { receiptTicketPatch, receiptImage } from '../../supabase/functions/parse-pos-receipt/operations.ts';
describe('staff receipt operations validation', () => {
  it('updates only the selected ticket count, never identity', () => {
    expect(receiptTicketPatch('normal_tickets', 2)).toEqual({ normal_tickets: 2 });
    expect(() => receiptTicketPatch('created_by', 2)).toThrow();
  });
  it('allows staff to correct Amount (QAR) including decimals and zero', () => {
    expect(receiptTicketPatch('amount_qar', 200.50)).toEqual({ amount_qar: 200.50 });
    expect(receiptTicketPatch('amount_qar', 0)).toEqual({ amount_qar: 0 });
    for (const value of [-1, Infinity, NaN, '200', null, 1.234, 100000000]) expect(() => receiptTicketPatch('amount_qar', value)).toThrow();
  });
  it('rejects invalid quantities', () => {
    for (const n of [-1, 0.5, Infinity, '2', null]) expect(() => receiptTicketPatch('vip_tickets', n)).toThrow();
  });
  it('recognizes photo bytes rather than trusting a file extension', () => {
    expect(receiptImage(btoa(String.fromCharCode(255,216,255,0))).mime).toBe('image/jpeg');
    expect(() => receiptImage(btoa('<script>'))).toThrow();
  });
});
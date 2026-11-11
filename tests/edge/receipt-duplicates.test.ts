import { describe, expect, it } from 'vitest';
import { isDuplicateReceiptError, receiptFullRowValues } from '../../supabase/functions/parse-pos-receipt/duplicates.ts';

describe('POS receipt exact duplicate rule', () => {
  const receipt = {
    amount_qar: 200,
    seq_number: '001036002',
    card_number_masked: '****1234',
    time: '12:06:02',
    auth_number: '020459',
    ticket_type: 'normal',
    num_tickets: null,
    normal_tickets: 1,
    vip_tickets: 0,
    parking_tickets: 0,
  };

  it('matches the complete receipt row while ignoring generated record metadata', () => {
    expect(receiptFullRowValues({ ...receipt, id: 'new-id', image_url: 'new-photo', created_by: 'other-user' }))
      .toEqual(receiptFullRowValues(receipt));
  });

  it.each(Object.keys(receipt))('does not treat a row as duplicate when %s differs', (field) => {
    const originalValue = receipt[field as keyof typeof receipt];
    const changedValue = typeof originalValue === 'number' ? originalValue + 1 : originalValue === null ? 1 : `${originalValue}-different`;
    expect(receiptFullRowValues({ ...receipt, [field]: changedValue }))
      .not.toEqual(receiptFullRowValues(receipt));
  });

  it('applies saved-row defaults to a newly extracted receipt', () => {
    expect(receiptFullRowValues({})).toEqual({
      amount_qar: null,
      seq_number: null,
      card_number_masked: null,
      time: null,
      auth_number: null,
      ticket_type: 'normal',
      num_tickets: null,
      normal_tickets: 0,
      vip_tickets: 0,
      parking_tickets: 0,
    });
  });

  it('recognizes only the database unique-violation response as a duplicate', () => {
    expect(isDuplicateReceiptError({ code: '23505' })).toBe(true);
    expect(isDuplicateReceiptError({ code: '42501' })).toBe(false);
    expect(isDuplicateReceiptError(null)).toBe(false);
  });
});

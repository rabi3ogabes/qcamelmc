export const DUPLICATE_RECEIPT_MESSAGE = 'هذا الإيصال مكرر: جميع القيم مطابقة لسجل محفوظ، ولم تتم إضافته.';

const RECEIPT_VALUE_DEFAULTS = {
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
} as const;

/** All visitor-entered receipt values; IDs, photos, timestamps and staff identity are excluded. */
export function receiptFullRowValues(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(RECEIPT_VALUE_DEFAULTS).map(([field, defaultValue]) => [field, input[field] ?? defaultValue]),
  );
}

export function isDuplicateReceiptError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

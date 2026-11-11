CREATE UNIQUE INDEX pos_receipts_full_row_values_unique
ON public.pos_receipts (
  amount_qar,
  seq_number,
  card_number_masked,
  time,
  auth_number,
  ticket_type,
  num_tickets,
  normal_tickets,
  vip_tickets,
  parking_tickets
) NULLS NOT DISTINCT;

COMMENT ON INDEX public.pos_receipts_full_row_values_unique IS 'Rejects exact duplicates across every visitor-entered receipt value; generated IDs, photos, timestamps and staff identity are excluded.';
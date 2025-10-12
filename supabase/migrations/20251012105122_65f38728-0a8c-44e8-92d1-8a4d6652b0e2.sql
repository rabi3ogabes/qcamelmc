-- Update existing ticket holders without QR codes to generate unique references
WITH numbered_holders AS (
  SELECT 
    th.id,
    o.booking_reference,
    ROW_NUMBER() OVER (PARTITION BY th.order_id ORDER BY th.created_at) as row_num
  FROM ticket_holders th
  JOIN orders o ON th.order_id = o.id
  WHERE th.qr_code IS NULL
)
UPDATE ticket_holders
SET qr_code = CONCAT(
  numbered_holders.booking_reference,
  '-TKT',
  LPAD(numbered_holders.row_num::TEXT, 2, '0')
)
FROM numbered_holders
WHERE ticket_holders.id = numbered_holders.id;
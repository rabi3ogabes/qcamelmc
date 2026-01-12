-- Add ticket_type column to pos_receipts table
ALTER TABLE public.pos_receipts 
ADD COLUMN ticket_type text DEFAULT 'normal';

-- Add comment for clarity
COMMENT ON COLUMN public.pos_receipts.ticket_type IS 'Type of ticket: normal (200 QAR), vip (300 QAR), or parking (500 QAR)';
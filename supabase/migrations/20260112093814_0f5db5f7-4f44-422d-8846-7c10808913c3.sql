-- Add num_tickets column to pos_receipts table for manual ticket count selection
ALTER TABLE public.pos_receipts 
ADD COLUMN num_tickets integer DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.pos_receipts.num_tickets IS 'Number of tickets manually selected by admin';
-- Add separate ticket count columns for each ticket type
ALTER TABLE public.pos_receipts 
ADD COLUMN normal_tickets integer DEFAULT 0,
ADD COLUMN vip_tickets integer DEFAULT 0,
ADD COLUMN parking_tickets integer DEFAULT 0;
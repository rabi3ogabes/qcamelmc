-- Add last_invoice_sent_at column to track when the last invoice was sent
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS last_invoice_sent_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.settings.last_invoice_sent_at IS 'Timestamp of when the last invoice was sent automatically';
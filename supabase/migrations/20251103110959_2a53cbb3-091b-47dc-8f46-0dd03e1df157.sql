-- Add delay between invoice sends settings (in seconds)
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS invoice_send_delay_min INTEGER DEFAULT 300,
ADD COLUMN IF NOT EXISTS invoice_send_delay_max INTEGER DEFAULT 600;

COMMENT ON COLUMN public.settings.invoice_send_delay_min IS 'Minimum delay in seconds between sending individual invoices';
COMMENT ON COLUMN public.settings.invoice_send_delay_max IS 'Maximum delay in seconds between sending individual invoices';
-- Add invoice batch size range settings
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS invoice_batch_min INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS invoice_batch_max INTEGER DEFAULT 10;

COMMENT ON COLUMN public.settings.invoice_batch_min IS 'Minimum number of invoices to send per batch';
COMMENT ON COLUMN public.settings.invoice_batch_max IS 'Maximum number of invoices to send per batch';
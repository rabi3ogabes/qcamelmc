-- Add auto invoice interval setting to settings table
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS auto_invoice_interval_seconds INTEGER DEFAULT 60;

COMMENT ON COLUMN public.settings.auto_invoice_interval_seconds IS 'Interval in seconds for automatic invoice sending via cron job';
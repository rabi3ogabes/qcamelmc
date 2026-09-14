ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS payment_failed_email_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS admin_email text;
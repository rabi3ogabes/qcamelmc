ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS webhook_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_webhook_enabled boolean NOT NULL DEFAULT true;
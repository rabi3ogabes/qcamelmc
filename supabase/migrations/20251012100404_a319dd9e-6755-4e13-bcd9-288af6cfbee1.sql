-- Add admin phone number to settings table
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS admin_phone text;
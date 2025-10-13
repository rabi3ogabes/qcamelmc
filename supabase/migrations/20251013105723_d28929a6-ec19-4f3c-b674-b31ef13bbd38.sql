-- Add Sadad payment settings columns to settings table
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS sadad_merchant_id text,
ADD COLUMN IF NOT EXISTS sadad_api_key text,
ADD COLUMN IF NOT EXISTS sadad_secret text;
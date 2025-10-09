-- Add webhook_url column to settings table
ALTER TABLE public.settings 
ADD COLUMN webhook_url text;
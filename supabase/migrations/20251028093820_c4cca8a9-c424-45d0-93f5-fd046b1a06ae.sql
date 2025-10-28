-- Add sadad_website_domain field to settings table
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS sadad_website_domain text;
-- Add header background image URL column to settings table
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS header_bg_image_url TEXT;
-- Add before_footer_image_url column to settings table
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS before_footer_image_url text;
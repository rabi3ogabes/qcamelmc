-- Add hero_image_url column to settings table
ALTER TABLE public.settings 
ADD COLUMN hero_image_url text;
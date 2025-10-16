-- Add setting to show/hide generate QR codes button
ALTER TABLE public.settings 
ADD COLUMN show_generate_qr_button boolean DEFAULT false;
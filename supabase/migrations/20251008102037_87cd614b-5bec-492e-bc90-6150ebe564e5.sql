-- Add header background color setting to settings table
ALTER TABLE public.settings 
ADD COLUMN header_bg_color text DEFAULT 'hsl(var(--card) / 0.5)';
-- Add setting to show/hide delete event button
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS show_delete_event_button boolean DEFAULT false;
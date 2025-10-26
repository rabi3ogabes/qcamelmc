-- Add display_order column to events table for manual ordering
ALTER TABLE public.events 
ADD COLUMN display_order integer DEFAULT 0;

-- Create an index for better performance when ordering
CREATE INDEX idx_events_display_order ON public.events(display_order);
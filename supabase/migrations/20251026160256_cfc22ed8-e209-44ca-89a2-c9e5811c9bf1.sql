-- Add start_time and end_time columns to events table
ALTER TABLE public.events
ADD COLUMN start_time time,
ADD COLUMN end_time time;
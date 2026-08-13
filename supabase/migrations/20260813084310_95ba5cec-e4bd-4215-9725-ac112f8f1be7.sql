ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS current_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS end_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_events_is_archived ON public.events (is_archived);
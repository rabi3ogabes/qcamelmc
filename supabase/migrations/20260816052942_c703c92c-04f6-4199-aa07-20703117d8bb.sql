CREATE TABLE IF NOT EXISTS public.email_delivery_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  booking_reference text,
  recipient text,
  template text NOT NULL DEFAULT 'booking-invoice',
  status text NOT NULL,
  attempt integer NOT NULL DEFAULT 1,
  detail text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_events_order ON public.email_delivery_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_delivery_events_recipient ON public.email_delivery_events(lower(recipient));

GRANT SELECT ON public.email_delivery_events TO authenticated;
GRANT ALL ON public.email_delivery_events TO service_role;

ALTER TABLE public.email_delivery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view email delivery events" ON public.email_delivery_events;
CREATE POLICY "Admins can view email delivery events"
ON public.email_delivery_events
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));
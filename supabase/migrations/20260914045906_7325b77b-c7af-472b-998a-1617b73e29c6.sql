CREATE TABLE public.payment_errors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  booking_reference text,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  quantity integer,
  amount numeric,
  payment_id text,
  error_source text NOT NULL DEFAULT 'site',
  error_code text,
  error_message text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_payment_errors_created_at ON public.payment_errors (created_at DESC);
CREATE INDEX idx_payment_errors_event_id ON public.payment_errors (event_id);

GRANT INSERT ON public.payment_errors TO anon;
GRANT SELECT, INSERT, DELETE ON public.payment_errors TO authenticated;
GRANT ALL ON public.payment_errors TO service_role;

ALTER TABLE public.payment_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log payment errors"
ON public.payment_errors FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can view payment errors"
ON public.payment_errors FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete payment errors"
ON public.payment_errors FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));
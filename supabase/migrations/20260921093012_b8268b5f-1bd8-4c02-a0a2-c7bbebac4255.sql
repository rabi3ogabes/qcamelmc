CREATE TABLE public.login_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier text NOT NULL,
  kind text NOT NULL DEFAULT 'account',
  ip_address text,
  user_agent text,
  success boolean NOT NULL DEFAULT false,
  attempted_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_attempts_lookup ON public.login_attempts (identifier, attempted_at DESC);
CREATE INDEX idx_login_attempts_time ON public.login_attempts (attempted_at DESC);

GRANT SELECT ON public.login_attempts TO authenticated;
GRANT ALL ON public.login_attempts TO service_role;

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view login attempts"
  ON public.login_attempts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.cleanup_login_attempts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.login_attempts WHERE attempted_at < now() - interval '7 days';
$$;
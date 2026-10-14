CREATE TABLE public.api_calls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fn text NOT NULL,
  method text NOT NULL,
  status integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  origin text,
  ip text,
  country text,
  user_agent text,
  caller text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.api_calls TO authenticated;
GRANT ALL ON public.api_calls TO service_role;
ALTER TABLE public.api_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read api calls" ON public.api_calls FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX api_calls_created_idx ON public.api_calls (created_at DESC);
CREATE INDEX api_calls_fn_created_idx ON public.api_calls (fn, created_at DESC);
CREATE TABLE public.app_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'site',
  kind text NOT NULL,
  message text NOT NULL,
  stack text,
  page text,
  user_agent text,
  occurrences integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);
CREATE INDEX app_errors_last_seen_idx ON public.app_errors (last_seen_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.app_errors TO authenticated;
GRANT ALL ON public.app_errors TO service_role;
ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read app errors" ON public.app_errors FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update app errors" ON public.app_errors FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete app errors" ON public.app_errors FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_app_error(p_kind text, p_message text, p_stack text DEFAULT NULL, p_page text DEFAULT NULL, p_source text DEFAULT 'site')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kind text := left(coalesce(nullif(trim(p_kind), ''), 'error'), 40);
  v_msg text := left(coalesce(nullif(trim(p_message), ''), 'Unknown error'), 1000);
  v_page text := left(split_part(split_part(coalesce(p_page, ''), '?', 1), '#', 1), 300);
  v_source text := CASE WHEN p_source IN ('site','server') THEN p_source ELSE 'site' END;
  v_fp text;
BEGIN
  -- Same cause = same message with numbers/ids stripped, on the same page.
  v_fp := md5(v_source || '|' || v_kind || '|' || regexp_replace(lower(v_msg), '[0-9a-f]{8,}|[0-9]+', '#', 'g') || '|' ||
              regexp_replace(v_page, '[0-9a-f-]{16,}|[0-9]+', '#', 'g'));
  UPDATE app_errors SET occurrences = least(occurrences + 1, 1000000000), last_seen_at = now(),
         stack = coalesce(left(p_stack, 4000), stack), page = nullif(v_page, ''),
         user_agent = left(current_setting('request.headers', true)::json->>'user-agent', 300),
         resolved_at = NULL, resolved_by = NULL
   WHERE fingerprint = v_fp AND last_seen_at < now() - interval '2 seconds';
  IF FOUND OR EXISTS (SELECT 1 FROM app_errors WHERE fingerprint = v_fp) THEN RETURN; END IF;
  -- Flood guard: cap distinct causes.
  IF (SELECT count(*) FROM app_errors) >= 5000 THEN RETURN; END IF;
  INSERT INTO app_errors (fingerprint, source, kind, message, stack, page, user_agent)
  VALUES (v_fp, v_source, v_kind, v_msg, left(p_stack, 4000), nullif(v_page, ''),
          left(current_setting('request.headers', true)::json->>'user-agent', 300))
  ON CONFLICT (fingerprint) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.log_app_error(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_app_error(text,text,text,text,text) TO anon, authenticated, service_role;
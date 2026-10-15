CREATE TABLE public.receipt_ai_usage (
  subject text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  lease_id uuid,
  lease_until timestamptz
);
GRANT ALL ON public.receipt_ai_usage TO service_role;
ALTER TABLE public.receipt_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.acquire_receipt_ai_slot(p_subject text, p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.receipt_ai_usage%ROWTYPE; t timestamptz := clock_timestamp();
BEGIN
  IF p_subject IS NULL OR length(p_subject) > 100 OR p_lease IS NULL THEN RAISE EXCEPTION 'invalid_subject'; END IF;
  INSERT INTO public.receipt_ai_usage(subject) VALUES (p_subject) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.receipt_ai_usage WHERE subject = p_subject FOR UPDATE;
  IF r.lease_until > t THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'busy', 'retry_after', ceil(extract(epoch FROM r.lease_until - t)));
  END IF;
  IF r.window_started_at + interval '10 minutes' <= t THEN
    r.window_started_at := t; r.request_count := 0;
  END IF;
  IF r.request_count >= 10 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota', 'retry_after', ceil(extract(epoch FROM r.window_started_at + interval '10 minutes' - t)));
  END IF;
  UPDATE public.receipt_ai_usage SET window_started_at = r.window_started_at, request_count = r.request_count + 1, lease_id = p_lease, lease_until = t + interval '90 seconds' WHERE subject = p_subject;
  RETURN jsonb_build_object('allowed', true);
END;
$$;
REVOKE ALL ON FUNCTION public.acquire_receipt_ai_slot(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_receipt_ai_slot(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_receipt_ai_slot(p_subject text, p_lease uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.receipt_ai_usage SET lease_id = NULL, lease_until = NULL WHERE subject = p_subject AND lease_id = p_lease;
$$;
REVOKE ALL ON FUNCTION public.release_receipt_ai_slot(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_receipt_ai_slot(text, uuid) TO service_role;
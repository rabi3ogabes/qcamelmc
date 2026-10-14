-- Visitor rows are keyed by a random session code (crypto.randomUUID); only that code touches its row.
CREATE OR REPLACE FUNCTION public.visitor_heartbeat(p_session_id text, p_page text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) NOT BETWEEN 32 AND 64 THEN RETURN false; END IF;
  UPDATE active_visitors
     SET current_page = left(COALESCE(p_page, current_page), 500), last_seen_at = now()
   WHERE session_id = p_session_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;

CREATE OR REPLACE FUNCTION public.visitor_leave(p_session_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM active_visitors
   WHERE session_id = p_session_id AND length(p_session_id) BETWEEN 32 AND 64;
$$;

REVOKE ALL ON FUNCTION public.visitor_heartbeat(text, text), public.visitor_leave(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.visitor_heartbeat(text, text), public.visitor_leave(text) TO anon, authenticated, service_role;

-- visit_token is no longer required: the session code itself is the secret
DROP POLICY IF EXISTS "Anyone can insert their session" ON public.active_visitors;
CREATE POLICY "Anyone can insert their session" ON public.active_visitors
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(session_id) BETWEEN 32 AND 64
    AND length(current_page) <= 500
    AND COALESCE(length(user_agent), 0) <= 1000
    AND COALESCE(length(referrer), 0) <= 1000
  );
COMMENT ON COLUMN public.active_visitors.visit_token IS 'DEPRECATED: replaced by the random session_id';
COMMENT ON FUNCTION public.touch_active_visit(text, text, text) IS 'DEPRECATED: replaced by visitor_heartbeat';
COMMENT ON FUNCTION public.end_active_visit(text, text) IS 'DEPRECATED: replaced by visitor_leave';

-- page views: bound sizes too
DROP POLICY IF EXISTS "Anyone can insert page views" ON public.page_views;
CREATE POLICY "Anyone can insert page views" ON public.page_views
  FOR INSERT TO anon, authenticated
  WITH CHECK (length(session_id) <= 64 AND length(page_path) <= 500);

-- Storage: public buckets still serve direct file links; only admins may list folders.
DROP POLICY IF EXISTS "Allow public read access to QR codes" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view QR codes" ON storage.objects;
DROP POLICY IF EXISTS "Public can view POS receipt images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can list QR codes and receipts" ON storage.objects;
CREATE POLICY "Admins can list QR codes and receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('qr-codes', 'pos-receipts') AND public.is_admin((SELECT auth.uid())));
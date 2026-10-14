CREATE OR REPLACE FUNCTION public.cleanup_stale_visitors()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RETURN;  -- quietly do nothing for non-admins
  END IF;
  DELETE FROM public.active_visitors WHERE last_seen_at < now() - INTERVAL '5 minutes';
END $$;
REVOKE ALL ON FUNCTION public.cleanup_stale_visitors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_visitors() TO authenticated, service_role;
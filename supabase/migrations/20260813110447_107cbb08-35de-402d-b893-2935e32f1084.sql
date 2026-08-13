ALTER VIEW public.public_settings SET (security_invoker = on);

REVOKE EXECUTE ON FUNCTION public.get_lifetime_ticket_totals() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_lifetime_ticket_totals() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_stale_visitors() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_visitors() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_page_view_stats(timestamptz, timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_page_view_stats(timestamptz, timestamptz) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_visitors_per_country(timestamptz, timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_visitors_per_country(timestamptz, timestamptz) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_visitors_per_date(timestamptz, timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_visitors_per_date(timestamptz, timestamptz) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_login_attempts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_login_attempts() TO service_role;
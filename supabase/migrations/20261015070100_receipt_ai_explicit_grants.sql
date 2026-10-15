REVOKE ALL ON public.receipt_ai_usage FROM anon, authenticated;
GRANT ALL ON public.receipt_ai_usage TO service_role;
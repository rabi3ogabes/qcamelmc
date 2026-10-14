DROP POLICY IF EXISTS "Anyone can insert activity logs" ON public.activity_logs;
CREATE POLICY "Anyone can insert activity logs" ON public.activity_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(activity_type) <= 100 AND length(user_type) <= 50
    AND pg_column_size(action_data) <= 16384
    AND COALESCE(pg_column_size(metadata), 0) <= 16384
  );

DROP POLICY IF EXISTS "Anyone can log payment errors" ON public.payment_errors;
CREATE POLICY "Anyone can log payment errors" ON public.payment_errors
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    error_source IN ('sadad', 'bank', 'site')
    AND COALESCE(length(error_message), 0) <= 2000
    AND pg_column_size(raw) <= 16384
  );
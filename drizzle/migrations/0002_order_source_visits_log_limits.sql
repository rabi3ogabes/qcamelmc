-- orders.source: where an order came from (web | pos)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web';
UPDATE public.orders SET source = 'pos'
 WHERE booking_reference LIKE 'POS-%' OR (payment_method = 'cash_pos' AND pos_user_id IS NOT NULL);
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_source_check CHECK (source IN ('web', 'pos'));

CREATE OR REPLACE FUNCTION public.orders_set_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.booking_reference LIKE 'POS-%' THEN NEW.source := 'pos'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_set_source ON public.orders;
CREATE TRIGGER orders_set_source BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_set_source();

-- Visitor records: only the holder of the secret visit code may refresh/remove its own row
ALTER TABLE public.active_visitors ADD COLUMN IF NOT EXISTS visit_token text;
DROP POLICY IF EXISTS "Anyone can update their session" ON public.active_visitors;
DROP POLICY IF EXISTS "Anyone can delete their session" ON public.active_visitors;
DROP POLICY IF EXISTS "Anyone can insert their session" ON public.active_visitors;
REVOKE UPDATE, DELETE ON public.active_visitors FROM anon;
CREATE POLICY "Anyone can insert their session" ON public.active_visitors
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    visit_token IS NOT NULL AND length(visit_token) BETWEEN 32 AND 64
    AND length(session_id) BETWEEN 32 AND 64
    AND length(current_page) <= 500
    AND COALESCE(length(user_agent), 0) <= 1000
    AND COALESCE(length(referrer), 0) <= 1000
  );

CREATE OR REPLACE FUNCTION public.touch_active_visit(p_session_id text, p_token text, p_page text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RETURN false; END IF;
  UPDATE active_visitors
     SET current_page = left(COALESCE(p_page, current_page), 500), last_seen_at = now()
   WHERE session_id = p_session_id AND visit_token = p_token;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;

CREATE OR REPLACE FUNCTION public.end_active_visit(p_session_id text, p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM active_visitors
   WHERE session_id = p_session_id AND visit_token = p_token AND length(p_token) >= 32;
$$;

REVOKE ALL ON FUNCTION public.touch_active_visit(text, text, text), public.end_active_visit(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_active_visit(text, text, text), public.end_active_visit(text, text)
  TO anon, authenticated, service_role;

-- Size limits for entries anyone may write
ALTER TABLE public.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_size_limits;
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_size_limits CHECK (
  length(activity_type) <= 100 AND length(user_type) <= 50
  AND COALESCE(length(user_identifier), 0) <= 255
  AND pg_column_size(action_data) <= 16384
  AND COALESCE(pg_column_size(metadata), 0) <= 16384
  AND COALESCE(length(ip_address), 0) <= 100
  AND COALESCE(length(user_agent), 0) <= 1000
) NOT VALID;

ALTER TABLE public.payment_errors DROP CONSTRAINT IF EXISTS payment_errors_size_limits;
ALTER TABLE public.payment_errors ADD CONSTRAINT payment_errors_size_limits CHECK (
  length(error_source) <= 20
  AND COALESCE(length(error_code), 0) <= 200
  AND COALESCE(length(error_message), 0) <= 2000
  AND COALESCE(length(booking_reference), 0) <= 100
  AND COALESCE(length(customer_name), 0) <= 200
  AND COALESCE(length(customer_phone), 0) <= 50
  AND COALESCE(length(payment_id), 0) <= 200
  AND pg_column_size(raw) <= 16384
) NOT VALID;
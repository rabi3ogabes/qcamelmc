-- 1. SETTINGS: remove public read, expose safe view
DROP POLICY IF EXISTS "Anyone can view settings" ON public.settings;

CREATE OR REPLACE VIEW public.public_settings
WITH (security_invoker = off) AS
SELECT
  id,
  logo_url,
  header_bg_color,
  header_bg_image_url,
  hero_image_url,
  hero_text,
  before_footer_image_url,
  copyright_text,
  current_event_id,
  show_delete_customer_button,
  show_generate_qr_button,
  show_delete_event_button
FROM public.settings;

GRANT SELECT ON public.public_settings TO anon, authenticated;

-- 2. CUSTOMERS / ORDERS / TICKET HOLDERS: remove public + broken policies
DROP POLICY IF EXISTS "customers_public_select_policy" ON public.customers;
DROP POLICY IF EXISTS "Customers can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Public can view ticket holders" ON public.ticket_holders;
DROP POLICY IF EXISTS "Customers can view their ticket holders" ON public.ticket_holders;

-- 3. PAGE VIEWS + EXPIRED QR: admin only
DROP POLICY IF EXISTS "Public can view page views for live visitors page" ON public.page_views;
DROP POLICY IF EXISTS "Public can check expired QR codes" ON public.expired_qr_codes;

-- 4. Availability counts (no personal data)
CREATE OR REPLACE FUNCTION public.get_event_ticket_counts(p_event_id uuid)
RETURNS TABLE(ticket_type text, confirmed_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT th.ticket_type, COUNT(*)::bigint
  FROM public.ticket_holders th
  JOIN public.orders o ON o.id = th.order_id
  WHERE o.event_id = p_event_id
    AND o.payment_status = 'confirmed'
  GROUP BY th.ticket_type
$$;

GRANT EXECUTE ON FUNCTION public.get_event_ticket_counts(uuid) TO anon, authenticated;

-- 5. Public booking lookup (by unguessable order id or booking reference)
CREATE OR REPLACE FUNCTION public.get_public_order(p_order_id uuid DEFAULT NULL, p_booking_reference text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'id', o.id,
    'booking_reference', o.booking_reference,
    'ticket_type', o.ticket_type,
    'quantity', o.quantity,
    'total_amount', o.total_amount,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'payment_id', o.payment_id,
    'payment_error_reason', o.payment_error_reason,
    'confirmed_at', o.confirmed_at,
    'created_at', o.created_at,
    'customers', jsonb_build_object(
      'name', c.name,
      'email', c.email,
      'phone', c.phone,
      'country_code', c.country_code,
      'nationality', c.nationality
    ),
    'events', jsonb_build_object(
      'title', e.title,
      'event_date', e.event_date,
      'location', e.location
    ),
    'ticket_holders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', th.id,
        'name', th.name,
        'phone', th.phone,
        'country_code', th.country_code,
        'nationality', th.nationality,
        'id_number', th.id_number,
        'ticket_type', th.ticket_type,
        'qr_code', th.qr_code,
        'is_present', th.is_present
      ) ORDER BY th.created_at)
      FROM public.ticket_holders th WHERE th.order_id = o.id
    ), '[]'::jsonb)
  )
  FROM public.orders o
  JOIN public.customers c ON c.id = o.customer_id
  JOIN public.events e ON e.id = o.event_id
  WHERE (p_order_id IS NOT NULL AND o.id = p_order_id)
     OR (p_booking_reference IS NOT NULL AND o.booking_reference = p_booking_reference)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_public_order(uuid, text) TO anon, authenticated;

-- 6. Lifetime ticket totals (admins only)
CREATE OR REPLACE FUNCTION public.get_lifetime_ticket_totals()
RETURNS TABLE(person_key text, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH holders AS (
    SELECT th.phone, th.id_number
    FROM public.ticket_holders th
    JOIN public.orders o ON o.id = th.order_id
    WHERE o.payment_status = 'confirmed'
  ), keys AS (
    SELECT 'id:' || regexp_replace(COALESCE(h.id_number, ''), '\D', '', 'g') AS k
    FROM holders h
    WHERE length(regexp_replace(COALESCE(h.id_number, ''), '\D', '', 'g')) >= 6
    UNION ALL
    SELECT 'ph:' || right(regexp_replace(COALESCE(h.phone, ''), '\D', '', 'g'), 8) AS k
    FROM holders h
    WHERE length(regexp_replace(COALESCE(h.phone, ''), '\D', '', 'g')) >= 8
  )
  SELECT k, COUNT(*)::bigint FROM keys GROUP BY k;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_lifetime_ticket_totals() TO authenticated;

-- 7. Fix mutable search_path
CREATE OR REPLACE FUNCTION public.cleanup_stale_visitors()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.active_visitors
  WHERE last_seen_at < NOW() - INTERVAL '5 minutes';
END;
$$;

-- 8. Performance indexes
CREATE INDEX IF NOT EXISTS idx_orders_booking_reference ON public.orders (booking_reference);
CREATE INDEX IF NOT EXISTS idx_orders_event_status ON public.orders (event_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_holders_order_id ON public.ticket_holders (order_id);
CREATE INDEX IF NOT EXISTS idx_ticket_holders_qr_code ON public.ticket_holders (qr_code);
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON public.tickets (event_id);
CREATE INDEX IF NOT EXISTS idx_page_views_viewed_at ON public.page_views (viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_active_visitors_last_seen ON public.active_visitors (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_active_archived ON public.events (is_active, is_archived);
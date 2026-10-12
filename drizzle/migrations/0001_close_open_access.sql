-- =============================================================================
-- Close the open doors around orders.
--
-- APPLY ONLY AFTER the new site and the edge functions are live (see
-- docs/DEPLOYMENT.md): the previous site still books through the functions and
-- policies removed here.
--
-- Before: anyone with the public API key could
--   * call create_pos_booking() and receive CONFIRMED tickets without paying,
--   * insert an order that is already "confirmed" straight into the table,
--   * ask get_public_order() for every holder's national ID.
-- After: orders come into existence only through create_order() (service role,
-- called by the create-order edge function), which prices from the database.
-- =============================================================================

-- 1. No browser can write orders, customers or ticket holders any more
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
DROP POLICY IF EXISTS "Anyone can create ticket holders" ON public.ticket_holders;
REVOKE INSERT ON public.orders, public.customers, public.ticket_holders FROM anon, authenticated;

-- 2. The old booking functions are for the server only
REVOKE ALL ON FUNCTION public.create_public_booking(jsonb, uuid, public.payment_method, numeric, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_pos_booking(jsonb, uuid, numeric, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;

-- 3. The public order lookup (invoice page, confirmation) no longer returns
--    national ID numbers to the public; a signed-in administrator still gets them
--    (the printed ticket shows them). A booking reference is a 12-character random
--    value, so holding the reference is what proves it is your order.
CREATE OR REPLACE FUNCTION public.get_public_order(p_order_id uuid DEFAULT NULL, p_booking_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      'name', c.name, 'email', c.email, 'phone', c.phone,
      'country_code', c.country_code, 'nationality', c.nationality),
    'events', jsonb_build_object('title', e.title, 'event_date', e.event_date, 'location', e.location),
    'ticket_holders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', th.id, 'name', th.name, 'phone', th.phone, 'country_code', th.country_code,
        'nationality', th.nationality, 'ticket_type', th.ticket_type,
        'qr_code', th.qr_code, 'qr_image_url', th.qr_image_url,
        'is_present', th.is_present, 'confirmed_at', th.confirmed_at,
        'confirmed_by_name', th.confirmed_by_name
      ) || CASE WHEN public.is_admin((SELECT auth.uid()))
                THEN jsonb_build_object('id_number', th.id_number) ELSE '{}'::jsonb END
        ORDER BY th.created_at)
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

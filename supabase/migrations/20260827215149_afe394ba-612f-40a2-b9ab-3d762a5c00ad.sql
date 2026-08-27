ALTER TABLE public.ticket_holders ADD COLUMN IF NOT EXISTS confirmed_by_name text;

CREATE OR REPLACE FUNCTION public.get_public_order(p_order_id uuid DEFAULT NULL::uuid, p_booking_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'is_present', th.is_present,
        'confirmed_at', th.confirmed_at,
        'confirmed_by_name', th.confirmed_by_name
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
$function$;
CREATE OR REPLACE FUNCTION public.get_event_ticket_counts(p_event_id uuid)
 RETURNS TABLE(ticket_type text, confirmed_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT th.ticket_type, COUNT(*)::bigint
  FROM public.ticket_holders th
  JOIN public.orders o ON o.id = th.order_id
  WHERE o.event_id = p_event_id
    AND (
      o.payment_status = 'confirmed'
      OR (o.payment_status = 'pending' AND o.created_at > now() - INTERVAL '15 minutes')
    )
  GROUP BY th.ticket_type
$function$;
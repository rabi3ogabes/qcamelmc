CREATE OR REPLACE FUNCTION public.get_person_event_history(p_id_number text, p_phone text)
RETURNS TABLE(event_id uuid, title text, event_date timestamptz, ticket_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.title, e.event_date, count(*)::bigint
  FROM public.ticket_holders th
  JOIN public.orders o ON o.id = th.order_id AND o.payment_status = 'confirmed'
  JOIN public.events e ON e.id = o.event_id
  WHERE (
      (length(regexp_replace(coalesce(p_id_number,''), '\D', '', 'g')) >= 6
        AND regexp_replace(coalesce(th.id_number,''), '\D', '', 'g') = regexp_replace(p_id_number, '\D', '', 'g'))
      OR
      (length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) >= 8
        AND right(regexp_replace(coalesce(th.phone,''), '\D', '', 'g'), 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8))
  )
  GROUP BY e.id, e.title, e.event_date
  ORDER BY e.event_date DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_person_event_history(text, text) TO authenticated, anon, service_role;
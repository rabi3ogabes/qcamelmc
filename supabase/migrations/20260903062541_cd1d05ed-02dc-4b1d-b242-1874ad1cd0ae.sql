CREATE OR REPLACE FUNCTION public.reserve_tickets(p_event_id uuid, p_ticket_type text, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ticket_record RECORD;
  v_taken_count integer;
  v_available integer;
  v_lock_key bigint;
BEGIN
  v_lock_key := hashtext(p_event_id::text || p_ticket_type);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT id, available_quantity
  INTO v_ticket_record
  FROM tickets
  WHERE event_id = p_event_id
    AND type::text = p_ticket_type;

  IF v_ticket_record IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TICKET_NOT_FOUND',
      'message', 'نوع التذكرة غير موجود لهذه الفعالية'
    );
  END IF;

  -- Count confirmed tickets plus tickets held by recent pending orders,
  -- matching exactly what enforce_ticket_capacity() allows.
  SELECT COUNT(*)
  INTO v_taken_count
  FROM ticket_holders th
  JOIN orders o ON th.order_id = o.id
  WHERE o.event_id = p_event_id
    AND th.ticket_type = p_ticket_type
    AND (
      o.payment_status = 'confirmed'
      OR (o.payment_status = 'pending' AND o.created_at > now() - INTERVAL '15 minutes')
    );

  v_available := v_ticket_record.available_quantity - v_taken_count;

  IF v_available < p_quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CAPACITY',
      'message', CASE WHEN v_available <= 0
        THEN 'عذراً، نفدت التذاكر من هذا النوع حالياً'
        ELSE 'عذراً، لا تتوفر تذاكر كافية. المتاح: ' || v_available || ' تذكرة' END,
      'available', GREATEST(v_available, 0),
      'requested', p_quantity
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'available', v_available,
    'after_reservation', v_available - p_quantity
  );
END;
$function$;
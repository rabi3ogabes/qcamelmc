-- Drop the old function and create a new one without FOR UPDATE
-- Instead use advisory lock for atomic operations

DROP FUNCTION IF EXISTS public.reserve_tickets(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.reserve_tickets(
  p_event_id uuid,
  p_ticket_type text,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_record RECORD;
  v_confirmed_count integer;
  v_available integer;
  v_lock_key bigint;
BEGIN
  -- Create a unique lock key from event_id and ticket_type
  v_lock_key := hashtext(p_event_id::text || p_ticket_type);
  
  -- Acquire advisory lock for this specific event+type combination
  PERFORM pg_advisory_xact_lock(v_lock_key);
  
  -- Get ticket capacity
  SELECT id, available_quantity
  INTO v_ticket_record
  FROM tickets
  WHERE event_id = p_event_id 
    AND type::text = p_ticket_type;
  
  -- If no ticket found for this type/event
  IF v_ticket_record IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TICKET_NOT_FOUND',
      'message', 'نوع التذكرة غير موجود لهذه الفعالية'
    );
  END IF;
  
  -- Count confirmed ticket holders for this event and type
  SELECT COUNT(*)
  INTO v_confirmed_count
  FROM ticket_holders th
  JOIN orders o ON th.order_id = o.id
  WHERE o.event_id = p_event_id
    AND th.ticket_type = p_ticket_type
    AND o.payment_status = 'confirmed';
  
  -- Calculate available tickets
  v_available := v_ticket_record.available_quantity - v_confirmed_count;
  
  -- Check if we have enough capacity
  IF v_available < p_quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_CAPACITY',
      'message', 'عذراً، لا تتوفر تذاكر كافية. المتاح: ' || v_available || ' تذكرة',
      'available', v_available,
      'requested', p_quantity
    );
  END IF;
  
  -- Success - capacity is available
  RETURN jsonb_build_object(
    'success', true,
    'available', v_available,
    'after_reservation', v_available - p_quantity
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.reserve_tickets(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tickets(uuid, text, integer) TO anon;
CREATE OR REPLACE FUNCTION public.create_pos_booking(p_customer jsonb, p_event_id uuid, p_total_amount numeric, p_booking_reference text, p_holders jsonb, p_pos_user_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_customer_id uuid;
  v_order_id uuid;
  v_holder jsonb;
  v_idx integer := 0;
  v_qr text;
  v_result jsonb := '[]'::jsonb;
  v_id uuid;
BEGIN
  IF p_event_id IS NULL OR p_holders IS NULL OR jsonb_array_length(p_holders) = 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: عدد التذاكر غير صالح' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.customers (name, email, phone, country_code, nationality, id_number)
  VALUES (
    p_customer->>'name',
    p_customer->>'email',
    p_customer->>'phone',
    COALESCE(p_customer->>'country_code', '+974'),
    p_customer->>'nationality',
    p_customer->>'id_number'
  )
  RETURNING id INTO v_customer_id;

  INSERT INTO public.orders (
    customer_id, event_id, ticket_type, quantity, total_amount,
    payment_method, payment_status, booking_reference,
    n8n_response_message, n8n_responded_at, pos_user_id, confirmed_at
  )
  VALUES (
    v_customer_id,
    p_event_id,
    (p_holders->0->>'ticket_type')::ticket_type,
    jsonb_array_length(p_holders),
    p_total_amount,
    'cash_pos'::payment_method,
    'confirmed'::payment_status,
    p_booking_reference,
    'طلب من نقطة البيع - POS',
    now(),
    p_pos_user_id,
    now()
  )
  RETURNING id INTO v_order_id;

  FOR v_holder IN SELECT * FROM jsonb_array_elements(p_holders)
  LOOP
    v_idx := v_idx + 1;
    v_qr := p_booking_reference || '-TKT' || lpad(v_idx::text, 2, '0');

    INSERT INTO public.ticket_holders (
      order_id, name, phone, country_code, nationality, ticket_type, qr_code, id_number, is_present
    )
    VALUES (
      v_order_id,
      v_holder->>'name',
      v_holder->>'phone',
      COALESCE(v_holder->>'country_code', '+974'),
      v_holder->>'nationality',
      v_holder->>'ticket_type',
      v_qr,
      v_holder->>'id_number',
      false
    )
    RETURNING id INTO v_id;

    v_result := v_result || jsonb_build_object('id', v_id, 'qr_code', v_qr, 'ticket_type', v_holder->>'ticket_type');
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'customer_id', v_customer_id,
    'booking_reference', p_booking_reference,
    'holders', v_result
  );
END;
$function$;

UPDATE public.ticket_holders
SET is_present = false
WHERE is_present = true AND confirmed_at IS NULL;
CREATE OR REPLACE FUNCTION public.enforce_ticket_limit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_event_id uuid;
  v_existing integer;
  v_in_order integer;
  v_id_key text;
  v_phone_key text;
  v_lock_key text;
BEGIN
  IF NEW.ticket_type NOT IN ('normal', 'vip') THEN RETURN NEW; END IF;
  SELECT o.event_id INTO v_event_id FROM public.orders o WHERE o.id = NEW.order_id;
  IF v_event_id IS NULL THEN RETURN NEW; END IF;

  v_id_key := regexp_replace(COALESCE(NEW.id_number, ''), '\D', '', 'g');
  IF length(v_id_key) < 6 THEN v_id_key := NULL; END IF;
  v_phone_key := right(regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'), 8);
  IF length(v_phone_key) < 8 THEN v_phone_key := NULL; END IF;
  IF v_id_key IS NULL AND v_phone_key IS NULL THEN RETURN NEW; END IF;

  v_lock_key := COALESCE('id:' || v_id_key, 'ph:' || v_phone_key) || ':' || v_event_id::text;
  PERFORM pg_advisory_xact_lock(hashtext(v_lock_key));

  v_existing := public.get_person_ticket_count(NEW.id_number, NEW.phone, v_event_id);

  IF v_existing >= 5 THEN
    -- report what the person held BEFORE this booking, not the seats this booking is adding
    SELECT count(*)::integer INTO v_in_order FROM public.ticket_holders th
     WHERE th.order_id = NEW.order_id AND th.ticket_type IN ('normal', 'vip')
       AND ((v_id_key IS NOT NULL AND regexp_replace(COALESCE(th.id_number, ''), '\D', '', 'g') = v_id_key)
         OR (v_id_key IS NULL AND right(regexp_replace(COALESCE(th.phone, ''), '\D', '', 'g'), 8) = v_phone_key));
    RAISE EXCEPTION 'TICKET_LIMIT_EXCEEDED: الحد الأقصى هو 5 تذاكر (عادي + VIP) لكل شخص في الفعالية. % لديه % تذكرة محجوزة مسبقاً، ويمكنه إضافة % فقط.',
      NEW.name, v_existing - v_in_order, GREATEST(0, 5 - (v_existing - v_in_order))
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
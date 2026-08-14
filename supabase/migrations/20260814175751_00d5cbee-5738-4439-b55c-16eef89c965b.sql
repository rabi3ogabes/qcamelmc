-- Count tickets already held by a person for a given event (normal + vip only)
CREATE OR REPLACE FUNCTION public.get_person_ticket_count(
  p_id_number text,
  p_phone text,
  p_event_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id_key text;
  v_phone_key text;
  v_count integer;
BEGIN
  v_id_key := regexp_replace(COALESCE(p_id_number, ''), '\D', '', 'g');
  IF length(v_id_key) < 6 THEN
    v_id_key := NULL;
  END IF;

  v_phone_key := right(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 8);
  IF length(v_phone_key) < 8 THEN
    v_phone_key := NULL;
  END IF;

  IF v_id_key IS NULL AND v_phone_key IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::integer INTO v_count
  FROM public.ticket_holders th
  JOIN public.orders o ON o.id = th.order_id
  WHERE o.event_id = p_event_id
    AND th.ticket_type IN ('normal', 'vip')
    AND (
      o.payment_status = 'confirmed'
      OR (o.payment_status = 'pending' AND o.created_at > now() - INTERVAL '15 minutes')
    )
    AND (
      (v_id_key IS NOT NULL
        AND length(regexp_replace(COALESCE(th.id_number, ''), '\D', '', 'g')) >= 6
        AND regexp_replace(COALESCE(th.id_number, ''), '\D', '', 'g') = v_id_key)
      OR
      (v_id_key IS NULL AND v_phone_key IS NOT NULL
        AND length(regexp_replace(COALESCE(th.phone, ''), '\D', '', 'g')) >= 8
        AND right(regexp_replace(COALESCE(th.phone, ''), '\D', '', 'g'), 8) = v_phone_key)
    );

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_person_ticket_count(text, text, uuid) TO anon, authenticated, service_role;

-- Hard guard: reject inserts that push a person above 5 normal+vip tickets per event
CREATE OR REPLACE FUNCTION public.enforce_ticket_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_id uuid;
  v_existing integer;
  v_id_key text;
  v_phone_key text;
  v_lock_key text;
BEGIN
  IF NEW.ticket_type NOT IN ('normal', 'vip') THEN
    RETURN NEW;
  END IF;

  SELECT o.event_id INTO v_event_id FROM public.orders o WHERE o.id = NEW.order_id;
  IF v_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_id_key := regexp_replace(COALESCE(NEW.id_number, ''), '\D', '', 'g');
  IF length(v_id_key) < 6 THEN v_id_key := NULL; END IF;
  v_phone_key := right(regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'), 8);
  IF length(v_phone_key) < 8 THEN v_phone_key := NULL; END IF;

  IF v_id_key IS NULL AND v_phone_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- serialize concurrent checkouts for the same person + event
  v_lock_key := COALESCE('id:' || v_id_key, 'ph:' || v_phone_key) || ':' || v_event_id::text;
  PERFORM pg_advisory_xact_lock(hashtext(v_lock_key));

  v_existing := public.get_person_ticket_count(NEW.id_number, NEW.phone, v_event_id);

  IF v_existing >= 5 THEN
    RAISE EXCEPTION 'TICKET_LIMIT_EXCEEDED: الحد الأقصى هو 5 تذاكر (عادي + VIP) لكل شخص. % لديه % تذكرة بالفعل', NEW.name, v_existing
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_ticket_limit ON public.ticket_holders;
CREATE TRIGGER trigger_enforce_ticket_limit
BEFORE INSERT ON public.ticket_holders
FOR EACH ROW EXECUTE FUNCTION public.enforce_ticket_limit();
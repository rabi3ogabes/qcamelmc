-- 1) Server-side price integrity: reject orders whose amount is lower than the authoritative price
CREATE OR REPLACE FUNCTION public.validate_order_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_price numeric;
  v_expected numeric;
BEGIN
  SELECT t.price INTO v_price
  FROM public.tickets t
  WHERE t.event_id = NEW.event_id AND t.type = NEW.ticket_type
  LIMIT 1;

  IF v_price IS NULL THEN
    RETURN NEW; -- no authoritative price configured; leave untouched
  END IF;

  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: عدد التذاكر غير صالح' USING ERRCODE = 'check_violation';
  END IF;

  v_expected := v_price * NEW.quantity;

  IF COALESCE(NEW.total_amount, 0) < v_expected - 0.01 THEN
    RAISE EXCEPTION 'AMOUNT_MISMATCH: المبلغ غير صحيح. المطلوب % ريال', v_expected
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validate_order_amount ON public.orders;
CREATE TRIGGER trigger_validate_order_amount
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.validate_order_amount();

-- 2) Atomic capacity enforcement at ticket-holder insert time (prevents overselling)
CREATE OR REPLACE FUNCTION public.enforce_ticket_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_id uuid;
  v_capacity integer;
  v_taken integer;
BEGIN
  SELECT o.event_id INTO v_event_id FROM public.orders o WHERE o.id = NEW.order_id;
  IF v_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.available_quantity INTO v_capacity
  FROM public.tickets t
  WHERE t.event_id = v_event_id AND t.type::text = NEW.ticket_type
  LIMIT 1;

  IF v_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  -- serialize concurrent inserts for this event + ticket type
  PERFORM pg_advisory_xact_lock(hashtext('cap:' || v_event_id::text || ':' || NEW.ticket_type));

  SELECT COUNT(*)::integer INTO v_taken
  FROM public.ticket_holders th
  JOIN public.orders o ON o.id = th.order_id
  WHERE o.event_id = v_event_id
    AND th.ticket_type = NEW.ticket_type
    AND th.id <> NEW.id
    AND (
      o.payment_status = 'confirmed'
      OR (o.payment_status = 'pending' AND o.created_at > now() - INTERVAL '15 minutes')
    );

  IF v_taken >= v_capacity THEN
    RAISE EXCEPTION 'CAPACITY_EXCEEDED: نفدت التذاكر من هذا النوع (السعة %)', v_capacity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_ticket_capacity ON public.ticket_holders;
CREATE TRIGGER trigger_enforce_ticket_capacity
BEFORE INSERT ON public.ticket_holders
FOR EACH ROW EXECUTE FUNCTION public.enforce_ticket_capacity();
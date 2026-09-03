-- 1) Relax order-level amount validation to support mixed ticket types
CREATE OR REPLACE FUNCTION public.validate_order_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_min_price numeric;
  v_expected numeric;
BEGIN
  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: عدد التذاكر غير صالح' USING ERRCODE = 'check_violation';
  END IF;

  -- An order may contain several ticket types; the authoritative per-ticket
  -- validation happens when ticket holders are inserted. Here we only guard
  -- against absurdly low amounts using the cheapest ticket for the event.
  SELECT MIN(t.price) INTO v_min_price
  FROM public.tickets t
  WHERE t.event_id = NEW.event_id;

  IF v_min_price IS NULL THEN
    RETURN NEW;
  END IF;

  v_expected := v_min_price * NEW.quantity;

  IF COALESCE(NEW.total_amount, 0) < v_expected - 0.01 THEN
    RAISE EXCEPTION 'AMOUNT_MISMATCH: المبلغ غير صحيح. الحد الأدنى المطلوب % ريال', v_expected
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Per-holder validation: total value of tickets must never exceed amount paid
CREATE OR REPLACE FUNCTION public.validate_holder_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_holders_value numeric;
BEGIN
  SELECT o.id, o.event_id, o.total_amount INTO v_order
  FROM public.orders o WHERE o.id = NEW.order_id;

  IF v_order.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(t.price), 0) INTO v_holders_value
  FROM public.ticket_holders th
  JOIN public.tickets t
    ON t.event_id = v_order.event_id AND t.type::text = th.ticket_type
  WHERE th.order_id = v_order.id;

  IF v_holders_value > COALESCE(v_order.total_amount, 0) + 0.01 THEN
    RAISE EXCEPTION 'AMOUNT_MISMATCH: المبلغ غير صحيح. قيمة التذاكر % ريال', v_holders_value
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_holder_amount() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_validate_holder_amount ON public.ticket_holders;
CREATE CONSTRAINT TRIGGER trigger_validate_holder_amount
AFTER INSERT ON public.ticket_holders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_holder_amount();
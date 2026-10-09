-- =============================================================================
-- Orders, payments and stock — ADDITIVE part.
--
-- Safe to apply while the current site is still live: it only adds objects and
-- copies data. The companion migration 20261009100200_lockdown_private_data.sql
-- removes the old open access; apply it after the new frontend and edge
-- functions are deployed (see docs/DEPLOYMENT.md).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Admin-only settings (gateway secrets, webhook URL, admin phone)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.private_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  webhook_url text,
  admin_phone text,
  sadad_merchant_id text,
  sadad_api_key text,
  sadad_secret text,
  sadad_website_domain text,
  sadad_environment text NOT NULL DEFAULT 'auto' CHECK (sadad_environment IN ('auto', 'sandbox', 'live')),
  site_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.private_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_settings FROM anon;

DROP POLICY IF EXISTS "Admins manage private settings" ON public.private_settings;
CREATE POLICY "Admins manage private settings" ON public.private_settings
  FOR ALL TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));

DROP TRIGGER IF EXISTS update_private_settings_updated_at ON public.private_settings;
CREATE TRIGGER update_private_settings_updated_at
  BEFORE UPDATE ON public.private_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Copy what lives in the public settings table today (nothing is lost). The
-- website domain keeps the value the old payment function used as its default.
INSERT INTO public.private_settings
  (webhook_url, admin_phone, sadad_merchant_id, sadad_api_key, sadad_secret, sadad_website_domain)
SELECT s.webhook_url, s.admin_phone, s.sadad_merchant_id, s.sadad_api_key, s.sadad_secret,
       COALESCE(NULLIF(btrim(s.sadad_website_domain), ''), 'qcamelmc.org')
  FROM public.settings s
 ORDER BY s.created_at
 LIMIT 1
ON CONFLICT (singleton) DO NOTHING;

INSERT INTO public.private_settings (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Ticket stock integrity
-- -----------------------------------------------------------------------------
UPDATE public.tickets SET sold_quantity = 0 WHERE sold_quantity IS NULL;
ALTER TABLE public.tickets
  ALTER COLUMN sold_quantity SET DEFAULT 0,
  ALTER COLUMN sold_quantity SET NOT NULL;

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_sold_quantity_nonneg;
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_available_quantity_nonneg;
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_price_nonneg;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_sold_quantity_nonneg CHECK (sold_quantity >= 0) NOT VALID;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_available_quantity_nonneg CHECK (available_quantity >= 0) NOT VALID;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_price_nonneg CHECK (price >= 0) NOT VALID;

-- -----------------------------------------------------------------------------
-- 3. Orders and ticket holders: payment bookkeeping + separate QR code/image
-- -----------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_note text,
  ADD COLUMN IF NOT EXISTS return_origin text,
  ADD COLUMN IF NOT EXISTS last_payment_check_at timestamptz;

-- One Sadad transaction can settle at most one order.
CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_id_key
  ON public.orders (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_pending_expiry_idx
  ON public.orders (payment_expires_at)
  WHERE payment_status = 'pending' AND payment_expires_at IS NOT NULL;

-- ticket_holders.qr_code used to hold the scannable code at first and the
-- image URL later (overwritten after QR generation), so scanning a ticket
-- could fail to find it. Keep them apart: qr_code = the code, qr_image_url = picture.
ALTER TABLE public.ticket_holders ADD COLUMN IF NOT EXISTS qr_image_url text;

UPDATE public.ticket_holders
   SET qr_image_url = qr_code,
       qr_code = regexp_replace(regexp_replace(qr_code, '^.*/', ''), '\.png(\?.*)?$', '', 'i')
 WHERE qr_code ~* '^https?://';

CREATE INDEX IF NOT EXISTS ticket_holders_qr_image_url_idx
  ON public.ticket_holders (qr_image_url) WHERE qr_image_url IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. Payment audit trail (Sadad asks merchants to keep callback/webhook logs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_reference text,
  order_id uuid REFERENCES public.orders (id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('callback', 'webhook', 'poll', 'admin')),
  payload jsonb,
  checksum_valid boolean,
  api_result text,
  decision text,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_events_ref_idx ON public.payment_events (booking_reference, created_at DESC);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_events FROM authenticated;
DROP POLICY IF EXISTS "Admins read payment events" ON public.payment_events;
CREATE POLICY "Admins read payment events" ON public.payment_events
  FOR SELECT TO authenticated USING (public.is_admin((SELECT auth.uid())));

-- -----------------------------------------------------------------------------
-- 5. Stock helpers. Invariant: tickets.sold_quantity = seats held by orders
--    that are pending or confirmed. Triggers keep it true whichever screen,
--    function or SQL statement changes an order.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._order_held_seats(p_order uuid)
RETURNS TABLE (ticket_type text, seats integer)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT th.ticket_type, count(*)::integer
    FROM ticket_holders th WHERE th.order_id = p_order GROUP BY th.ticket_type
  UNION ALL
  -- orders that predate ticket_holders have no holders: fall back to the order itself
  SELECT o.ticket_type::text, o.quantity
    FROM orders o
   WHERE o.id = p_order AND NOT EXISTS (SELECT 1 FROM ticket_holders WHERE order_id = p_order)
$$;

CREATE OR REPLACE FUNCTION public._release_order_stock(p_order uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_event uuid;
BEGIN
  SELECT event_id INTO v_event FROM orders WHERE id = p_order;
  IF v_event IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM tickets WHERE event_id = v_event ORDER BY id FOR UPDATE;
  UPDATE tickets t
     SET sold_quantity = GREATEST(0, t.sold_quantity - h.seats)
    FROM public._order_held_seats(p_order) h
   WHERE t.event_id = v_event AND t.type::text = h.ticket_type;
END $$;

CREATE OR REPLACE FUNCTION public._reserve_order_stock(p_order uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_event uuid;
BEGIN
  SELECT event_id INTO v_event FROM orders WHERE id = p_order;
  IF v_event IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM tickets WHERE event_id = v_event ORDER BY id FOR UPDATE;

  -- every held ticket type must still exist and have room
  IF EXISTS (
    SELECT 1
      FROM public._order_held_seats(p_order) h
      LEFT JOIN tickets t ON t.event_id = v_event AND t.type::text = h.ticket_type
     WHERE t.id IS NULL OR t.available_quantity - t.sold_quantity < h.seats
  ) THEN
    RETURN false;
  END IF;

  UPDATE tickets t
     SET sold_quantity = t.sold_quantity + h.seats
    FROM public._order_held_seats(p_order) h
   WHERE t.event_id = v_event AND t.type::text = h.ticket_type;
  RETURN true;
END $$;

-- Order changes state -> stock follows.
CREATE OR REPLACE FUNCTION public.orders_sync_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  was_active boolean := OLD.payment_status IN ('pending', 'confirmed');
  is_active boolean := NEW.payment_status IN ('pending', 'confirmed');
BEGIN
  IF was_active AND NOT is_active THEN
    PERFORM public._release_order_stock(NEW.id);
  ELSIF NOT was_active AND is_active THEN
    IF NOT public._reserve_order_stock(NEW.id) THEN
      RAISE EXCEPTION 'insufficient_stock';
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS orders_sync_stock ON public.orders;
CREATE TRIGGER orders_sync_stock
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW WHEN (OLD.payment_status IS DISTINCT FROM NEW.payment_status)
  EXECUTE FUNCTION public.orders_sync_stock();

-- A holder is deleted from a live order -> that seat is free again.
CREATE OR REPLACE FUNCTION public.holders_release_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o record;
BEGIN
  SELECT event_id, payment_status INTO o FROM orders WHERE id = OLD.order_id;
  IF NOT FOUND OR o.payment_status NOT IN ('pending', 'confirmed') THEN RETURN OLD; END IF;
  PERFORM 1 FROM tickets WHERE event_id = o.event_id ORDER BY id FOR UPDATE;
  UPDATE tickets
     SET sold_quantity = GREATEST(0, sold_quantity - 1)
   WHERE event_id = o.event_id AND type::text = OLD.ticket_type;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS ticket_holders_release_stock ON public.ticket_holders;
CREATE TRIGGER ticket_holders_release_stock
  BEFORE DELETE ON public.ticket_holders
  FOR EACH ROW EXECUTE FUNCTION public.holders_release_stock();

-- A live order is deleted while it still has holders -> release them first.
CREATE OR REPLACE FUNCTION public.orders_release_stock_on_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.payment_status IN ('pending', 'confirmed') THEN
    PERFORM public._release_order_stock(OLD.id);
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS orders_release_stock_on_delete ON public.orders;
CREATE TRIGGER orders_release_stock_on_delete
  BEFORE DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_release_stock_on_delete();

-- Recompute sold_quantity from the orders themselves (repairs historic drift:
-- online sales never counted before this change).
CREATE OR REPLACE FUNCTION public._recount_ticket_stock()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  WITH live AS (
    SELECT id, event_id, ticket_type::text AS fallback_type, quantity
      FROM orders WHERE payment_status IN ('pending', 'confirmed')
  ),
  per_holder AS (
    SELECT l.event_id, th.ticket_type, count(*)::integer AS seats
      FROM live l JOIN ticket_holders th ON th.order_id = l.id
     GROUP BY l.event_id, th.ticket_type
  ),
  per_order AS (
    SELECT l.event_id, l.fallback_type AS ticket_type, l.quantity AS seats
      FROM live l WHERE NOT EXISTS (SELECT 1 FROM ticket_holders th WHERE th.order_id = l.id)
  ),
  held AS (
    SELECT * FROM per_holder UNION ALL SELECT * FROM per_order
  )
  UPDATE tickets t
     SET sold_quantity = COALESCE((SELECT sum(h.seats) FROM held h
                                    WHERE h.event_id = t.event_id AND h.ticket_type = t.type::text), 0)
   WHERE t.sold_quantity IS DISTINCT FROM COALESCE((SELECT sum(h.seats) FROM held h
                                    WHERE h.event_id = t.event_id AND h.ticket_type = t.type::text), 0);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.recount_ticket_stock()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN public._recount_ticket_stock();
END $$;

-- One-off: bring the stock counters in line with reality.
SELECT public._recount_ticket_stock();

-- -----------------------------------------------------------------------------
-- 6. Order creation (the ONLY way an order comes into existence)
--    Prices come from the tickets table, stock is reserved atomically, the
--    order, its customer and its holders are created in one transaction.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_reference(p_prefix text DEFAULT 'QTR')
RETURNS text LANGUAGE sql VOLATILE SET search_path = public, pg_temp AS $$
  SELECT p_prefix || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_orders(p_event uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT id FROM orders
     WHERE payment_status = 'pending' AND payment_method = 'sadad'
       AND payment_expires_at IS NOT NULL AND payment_expires_at < now()
       AND (p_event IS NULL OR event_id = p_event)
     ORDER BY event_id, id
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE orders SET payment_status = 'failed', payment_note = 'expired' WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.create_order(
  p_customer jsonb,
  p_items jsonb,
  p_holders jsonb,
  p_payment_method public.payment_method,
  p_source text DEFAULT 'web',
  p_actor uuid DEFAULT NULL,
  p_return_origin text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c_hold_minutes constant integer := 30;   -- how long an unpaid online order keeps its seats
  c_max_admission constant integer := 5;   -- vip + normal per online order
  c_max_parking constant integer := 5;
  c_min_online constant numeric := 3;      -- Sadad minimum, QAR
  v_events uuid[];
  v_event uuid;
  v_active boolean;
  v_found integer;
  v_total numeric(10, 2) := 0;
  v_qty integer := 0;
  v_admission integer := 0;
  v_parking integer := 0;
  v_customer uuid;
  v_order uuid;
  v_ref text;
  v_attempt integer := 0;
  v_status public.payment_status;
  v_expires timestamptz;
  v_first_type public.ticket_type;
  v_items jsonb;
  v_holders jsonb;
  r record;
BEGIN
  IF p_source NOT IN ('web', 'pos') THEN RAISE EXCEPTION 'invalid_source'; END IF;

  IF p_customer IS NULL OR jsonb_typeof(p_customer) <> 'object'
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0
     OR p_holders IS NULL OR jsonb_typeof(p_holders) <> 'array'
     OR btrim(COALESCE(p_customer ->> 'name', '')) = ''
     OR btrim(COALESCE(p_customer ->> 'phone', '')) = '' THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS i(ticket_id uuid, quantity integer)
     WHERE i.ticket_id IS NULL OR i.quantity IS NULL OR i.quantity < 1
  ) OR (
    SELECT count(*) <> count(DISTINCT i.ticket_id) FROM jsonb_to_recordset(p_items) AS i(ticket_id uuid, quantity integer)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_holders) AS h(name text, phone text)
     WHERE btrim(COALESCE(h.name, '')) = '' OR btrim(COALESCE(h.phone, '')) = ''
  ) THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  -- which tickets / which event
  SELECT array_agg(DISTINCT t.event_id), count(*)
    INTO v_events, v_found
    FROM jsonb_to_recordset(p_items) AS i(ticket_id uuid, quantity integer)
    JOIN tickets t ON t.id = i.ticket_id;
  IF v_found IS DISTINCT FROM jsonb_array_length(p_items) OR array_length(v_events, 1) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'invalid_tickets';
  END IF;
  v_event := v_events[1];

  -- serialise with every other sale for this event, then free stale reservations
  PERFORM 1 FROM tickets WHERE event_id = v_event ORDER BY id FOR UPDATE;
  PERFORM public.expire_stale_orders(v_event);

  SELECT e.is_active INTO v_active FROM events e WHERE e.id = v_event;
  IF p_source = 'web' AND NOT COALESCE(v_active, false) THEN RAISE EXCEPTION 'event_not_available'; END IF;

  FOR r IN
    SELECT t.id, t.type, t.price, t.available_quantity, t.sold_quantity, i.quantity
      FROM jsonb_to_recordset(p_items) AS i(ticket_id uuid, quantity integer)
      JOIN tickets t ON t.id = i.ticket_id
     ORDER BY t.id
  LOOP
    IF r.available_quantity - r.sold_quantity < r.quantity THEN
      RAISE EXCEPTION 'insufficient_stock:%', r.type;
    END IF;
    v_total := v_total + r.price * r.quantity;
    v_qty := v_qty + r.quantity;
    IF r.type IN ('vip', 'normal') THEN v_admission := v_admission + r.quantity;
    ELSIF r.type = 'parking' THEN v_parking := v_parking + r.quantity;
    END IF;
  END LOOP;

  IF p_source = 'web' AND (v_admission > c_max_admission OR v_parking > c_max_parking) THEN
    RAISE EXCEPTION 'quantity_limit_exceeded';
  END IF;
  IF p_payment_method = 'sadad' AND v_total < c_min_online THEN
    RAISE EXCEPTION 'below_minimum_amount';
  END IF;

  -- exactly one holder per ticket, matched to its ticket type
  IF (SELECT count(*) FROM jsonb_to_recordset(p_holders) AS h(ticket_id uuid)) <> v_qty
     OR EXISTS (
       SELECT 1 FROM jsonb_to_recordset(p_items) AS i(ticket_id uuid, quantity integer)
        WHERE i.quantity <> (SELECT count(*) FROM jsonb_to_recordset(p_holders) AS h(ticket_id uuid)
                              WHERE h.ticket_id = i.ticket_id)
     ) THEN
    RAISE EXCEPTION 'holders_mismatch';
  END IF;

  IF p_source = 'pos' THEN
    v_status := 'confirmed';
  ELSE
    v_status := 'pending';
    IF p_payment_method = 'sadad' THEN v_expires := now() + make_interval(mins => c_hold_minutes); END IF;
  END IF;

  SELECT t.type INTO v_first_type
    FROM jsonb_to_recordset(p_items) AS i(ticket_id uuid, quantity integer)
    JOIN tickets t ON t.id = i.ticket_id
   ORDER BY t.price DESC, t.id LIMIT 1;

  INSERT INTO customers (name, email, phone, nationality, id_number, country_code)
  VALUES (btrim(p_customer ->> 'name'),
          COALESCE(btrim(p_customer ->> 'email'), ''),
          btrim(p_customer ->> 'phone'),
          NULLIF(btrim(COALESCE(p_customer ->> 'nationality', '')), ''),
          NULLIF(btrim(COALESCE(p_customer ->> 'id_number', '')), ''),
          COALESCE(NULLIF(btrim(COALESCE(p_customer ->> 'country_code', '')), ''), '+974'))
  RETURNING id INTO v_customer;

  LOOP
    v_ref := public.generate_reference(CASE WHEN p_source = 'pos' THEN 'POS' ELSE 'QTR' END);
    BEGIN
      INSERT INTO orders (customer_id, event_id, ticket_type, quantity, total_amount, payment_method,
                          payment_status, booking_reference, payment_expires_at, return_origin,
                          confirmed_by, paid_at)
      VALUES (v_customer, v_event, v_first_type, v_qty, v_total, p_payment_method,
              v_status, v_ref, v_expires, p_return_origin,
              CASE WHEN p_source = 'pos' THEN p_actor END,
              CASE WHEN p_source = 'pos' THEN now() END)
      RETURNING id INTO v_order;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 5 THEN RAISE; END IF;
    END;
  END LOOP;

  INSERT INTO ticket_holders (order_id, name, phone, country_code, nationality, ticket_type, qr_code, id_number)
  SELECT v_order,
         btrim(h.name),
         btrim(h.phone),
         COALESCE(substring(h.phone FROM '^\s*(\+\d{1,4})\s'),
                  NULLIF(btrim(COALESCE(p_customer ->> 'country_code', '')), ''), '+974'),
         COALESCE(btrim(h.nationality), ''),
         t.type::text,
         v_ref || '-TKT' || lpad(h.ord::text, 2, '0'),
         NULLIF(btrim(COALESCE(h.id_number, '')), '')
    FROM ROWS FROM (jsonb_to_recordset(p_holders)
           AS (ticket_id uuid, name text, phone text, nationality text, id_number text))
         WITH ORDINALITY AS h(ticket_id, name, phone, nationality, id_number, ord)
    JOIN tickets t ON t.id = h.ticket_id;

  UPDATE tickets t
     SET sold_quantity = t.sold_quantity + i.quantity
    FROM jsonb_to_recordset(p_items) AS i(ticket_id uuid, quantity integer)
   WHERE t.id = i.ticket_id;

  SELECT jsonb_agg(jsonb_build_object('ticket_id', t.id, 'type', t.type, 'price', t.price, 'quantity', i.quantity)
                   ORDER BY t.price DESC, t.id)
    INTO v_items
    FROM jsonb_to_recordset(p_items) AS i(ticket_id uuid, quantity integer)
    JOIN tickets t ON t.id = i.ticket_id;

  SELECT jsonb_agg(jsonb_build_object('id', th.id, 'qr_code', th.qr_code, 'ticket_type', th.ticket_type, 'name', th.name)
                   ORDER BY th.qr_code)
    INTO v_holders FROM ticket_holders th WHERE th.order_id = v_order;

  RETURN jsonb_build_object(
    'order_id', v_order, 'booking_reference', v_ref, 'total_amount', v_total,
    'payment_method', p_payment_method, 'payment_status', v_status,
    'payment_expires_at', v_expires, 'event_id', v_event,
    'items', v_items, 'holders', v_holders);
END $$;

-- -----------------------------------------------------------------------------
-- 7. Payment state transitions (called by the edge functions, service role only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_order_payment(p_booking_reference text, p_transaction_number text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o record;
BEGIN
  SELECT id, payment_status INTO o FROM orders WHERE booking_reference = p_booking_reference FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'order_not_found'); END IF;
  IF o.payment_status = 'confirmed' THEN
    RETURN jsonb_build_object('result', 'already_confirmed', 'order_id', o.id);
  END IF;
  IF p_transaction_number IS NULL OR btrim(p_transaction_number) = '' THEN RAISE EXCEPTION 'invalid_request'; END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE payment_id = p_transaction_number AND id <> o.id) THEN
    RETURN jsonb_build_object('result', 'transaction_already_used', 'order_id', o.id);
  END IF;

  BEGIN
    -- if the order had expired, the stock trigger re-reserves its seats here
    UPDATE orders
       SET payment_status = 'confirmed', payment_id = p_transaction_number, paid_at = now(), payment_note = NULL
     WHERE id = o.id;
  EXCEPTION
    WHEN raise_exception THEN
      UPDATE orders SET payment_id = p_transaction_number, paid_at = now(), payment_note = 'paid_after_expiry_no_stock'
       WHERE id = o.id;
      RETURN jsonb_build_object('result', 'paid_after_expiry_no_stock', 'order_id', o.id);
    WHEN unique_violation THEN
      RETURN jsonb_build_object('result', 'transaction_already_used', 'order_id', o.id);
  END;
  RETURN jsonb_build_object('result', 'confirmed', 'order_id', o.id);
END $$;

CREATE OR REPLACE FUNCTION public.mark_order_payment_failed(p_booking_reference text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o record;
BEGIN
  SELECT id, payment_status INTO o FROM orders WHERE booking_reference = p_booking_reference FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'order_not_found'); END IF;
  IF o.payment_status <> 'pending' THEN RETURN jsonb_build_object('result', 'not_pending', 'order_id', o.id); END IF;
  UPDATE orders SET payment_status = 'failed', payment_note = COALESCE(NULLIF(btrim(p_note), ''), 'payment_failed')
   WHERE id = o.id;
  RETURN jsonb_build_object('result', 'failed', 'order_id', o.id);
END $$;

-- Admin action ("return ticket"): cancels and puts the seats back on sale.
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o record;
BEGIN
  IF NOT public.is_admin((SELECT auth.uid())) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT id, payment_status INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'order_not_found'); END IF;
  IF o.payment_status NOT IN ('pending', 'confirmed') THEN
    RETURN jsonb_build_object('result', 'already_inactive', 'order_id', o.id);
  END IF;
  UPDATE orders SET payment_status = 'cancelled', payment_note = NULLIF(btrim(COALESCE(p_note, '')), '')
   WHERE id = o.id;
  RETURN jsonb_build_object('result', 'cancelled', 'order_id', o.id);
END $$;

-- Throttle for the public "check my payment" button: returns the order only if
-- it is an unpaid online order that was not checked in the last N seconds.
CREATE OR REPLACE FUNCTION public.claim_payment_check(p_booking_reference text, p_min_interval_seconds integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o record;
BEGIN
  UPDATE orders
     SET last_payment_check_at = now()
   WHERE booking_reference = p_booking_reference
     AND payment_status IN ('pending', 'failed')
     AND payment_method = 'sadad'
     AND created_at > now() - interval '3 days'
     AND (last_payment_check_at IS NULL
          OR last_payment_check_at < now() - make_interval(secs => p_min_interval_seconds))
  RETURNING id, booking_reference, total_amount, payment_status INTO o;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('order_id', o.id, 'booking_reference', o.booking_reference,
                            'total_amount', o.total_amount, 'payment_status', o.payment_status);
END $$;

-- -----------------------------------------------------------------------------
-- 8. Gate scanning
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_in_ticket(p_code text, p_admin uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  h record;
  v_now timestamptz := now();
  v_ticket jsonb;
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN RETURN jsonb_build_object('result', 'not_found'); END IF;

  SELECT th.id, th.name, th.phone, th.nationality, th.id_number, th.ticket_type, th.qr_code,
         th.is_present, th.confirmed_at, o.booking_reference, o.payment_status::text AS payment_status,
         c.name AS customer_name, e.title AS event_title
    INTO h
    FROM ticket_holders th
    JOIN orders o ON o.id = th.order_id
    JOIN customers c ON c.id = o.customer_id
    JOIN events e ON e.id = o.event_id
   WHERE th.qr_code = btrim(p_code) OR th.qr_image_url = btrim(p_code)
   LIMIT 1
   FOR UPDATE OF th;

  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'not_found'); END IF;

  v_ticket := jsonb_build_object(
    'booking_reference', h.booking_reference, 'customer_name', h.customer_name, 'event_title', h.event_title,
    'ticket_type', h.ticket_type, 'qr_code', h.qr_code, 'holder_name', h.name, 'holder_phone', h.phone,
    'holder_nationality', h.nationality, 'holder_id_number', h.id_number,
    'payment_status', h.payment_status, 'is_present', COALESCE(h.is_present, false), 'confirmed_at', h.confirmed_at);

  IF COALESCE(h.is_present, false) THEN
    RETURN jsonb_build_object('result', 'already_present', 'ticket', v_ticket);
  END IF;
  IF h.payment_status <> 'confirmed' THEN
    RETURN jsonb_build_object('result', 'payment_not_confirmed', 'ticket', v_ticket);
  END IF;

  UPDATE ticket_holders SET is_present = true, confirmed_at = v_now, confirmed_by = p_admin WHERE id = h.id;
  v_ticket := v_ticket || jsonb_build_object('is_present', true, 'confirmed_at', v_now);
  RETURN jsonb_build_object('result', 'checked_in', 'ticket', v_ticket);
END $$;

-- -----------------------------------------------------------------------------
-- 9. What a customer may look up by their (unguessable) booking reference
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_order_status(p_refs text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'booking_reference', o.booking_reference,
      'payment_status', o.payment_status,
      'payment_method', o.payment_method,
      'total_amount', o.total_amount,
      'quantity', o.quantity,
      'ticket_type', o.ticket_type,
      'created_at', o.created_at,
      'payment_expires_at', o.payment_expires_at,
      'event_id', o.event_id,
      'event', jsonb_build_object('title', e.title, 'event_date', e.event_date, 'location', e.location),
      'tickets', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('ticket_type', th.ticket_type, 'name', th.name,
                                            'qr_code', th.qr_code, 'qr_image_url', th.qr_image_url)
                         ORDER BY th.qr_code)
          FROM ticket_holders th WHERE th.order_id = o.id), '[]'::jsonb)
    ) ORDER BY o.created_at), '[]'::jsonb)
  FROM orders o
  JOIN events e ON e.id = o.event_id
  WHERE o.booking_reference = ANY (
    SELECT r FROM unnest(p_refs[1:10]) AS r WHERE r ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$'
  )
$$;

-- -----------------------------------------------------------------------------
-- 10. Function permissions: nothing is callable by the browser unless listed.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION
  public._order_held_seats(uuid), public._release_order_stock(uuid), public._reserve_order_stock(uuid),
  public.orders_sync_stock(), public.holders_release_stock(), public.orders_release_stock_on_delete(),
  public._recount_ticket_stock(), public.generate_reference(text), public.expire_stale_orders(uuid),
  public.create_order(jsonb, jsonb, jsonb, public.payment_method, text, uuid, text),
  public.confirm_order_payment(text, text), public.mark_order_payment_failed(text, text),
  public.claim_payment_check(text, integer), public.check_in_ticket(text, uuid),
  public.cancel_order(uuid, text), public.recount_ticket_stock(), public.get_order_status(text[]),
  public.generate_booking_reference(), public.generate_ticket_holder_reference()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.generate_reference(text), public.expire_stale_orders(uuid),
  public.create_order(jsonb, jsonb, jsonb, public.payment_method, text, uuid, text),
  public.confirm_order_payment(text, text), public.mark_order_payment_failed(text, text),
  public.claim_payment_check(text, integer), public.check_in_ticket(text, uuid)
TO service_role;

-- admin screens call these with the signed-in admin's own session
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text), public.recount_ticket_stock() TO authenticated;

-- customers look their own order up by reference
GRANT EXECUTE ON FUNCTION public.get_order_status(text[]) TO anon, authenticated;

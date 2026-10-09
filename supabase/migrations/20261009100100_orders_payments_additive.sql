-- =============================================================================
-- Orders, payments and stock — ADDITIVE part.
--
-- Safe to apply while the current site is still live: it adds objects, keeps
-- every existing function working and only repairs data. The companion
-- migration 20261009100200_close_open_access.sql removes the old open access;
-- apply it after the new site and edge functions are deployed
-- (see docs/DEPLOYMENT.md).
--
-- Order states stay pending / confirmed / cancelled. A payment that failed or
-- ran out of time is "cancelled" with orders.payment_note explaining why
-- ('payment_failed' | 'expired'); a staff cancellation has a different note.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Gateway settings that did not exist yet (settings is admin-only)
-- -----------------------------------------------------------------------------
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS sadad_environment text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS site_url text;

ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_sadad_environment_check;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_sadad_environment_check CHECK (sadad_environment IN ('auto', 'sandbox', 'live'));

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

-- One Sadad transaction can settle at most one order. Old data may already
-- contain a repeated transaction number: then keep a plain index and say so,
-- the application still refuses to reuse a number.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders WHERE payment_id IS NOT NULL
              GROUP BY payment_id HAVING count(*) > 1) THEN
    RAISE NOTICE 'orders.payment_id has duplicates: creating a non-unique index';
    CREATE INDEX IF NOT EXISTS orders_payment_id_key ON public.orders (payment_id) WHERE payment_id IS NOT NULL;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_id_key ON public.orders (payment_id) WHERE payment_id IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_pending_expiry_idx
  ON public.orders (payment_expires_at)
  WHERE payment_status = 'pending' AND payment_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_event_status_idx ON public.orders (event_id, payment_status);

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
-- 5. Unpaid orders that were never closed.
--    Until now an abandoned online checkout stayed "pending" forever and the
--    old stock counter ignored it. Now a pending online order holds seats, so
--    those leftovers must be closed first or they would block sales. Each is
--    marked cancelled/'expired'; a customer who really paid can still be
--    confirmed with the "verify with Sadad" button, which re-reserves the seats.
-- -----------------------------------------------------------------------------
-- the earlier counters recompute on every order change: remove them before this bulk update
DROP TRIGGER IF EXISTS trigger_update_ticket_sold_on_order_confirm ON public.orders;
DROP TRIGGER IF EXISTS trigger_update_ticket_sold_on_order_delete ON public.orders;
DROP TRIGGER IF EXISTS trigger_update_ticket_sold_on_holder_change ON public.ticket_holders;
DROP TRIGGER IF EXISTS trigger_enforce_ticket_capacity ON public.ticket_holders;

UPDATE public.orders
   SET payment_expires_at = created_at + interval '30 minutes'
 WHERE payment_status = 'pending' AND payment_method = 'sadad' AND payment_expires_at IS NULL;

UPDATE public.orders
   SET payment_status = 'cancelled', payment_note = 'expired'
 WHERE payment_status = 'pending' AND payment_method = 'sadad' AND payment_expires_at < now();

-- -----------------------------------------------------------------------------
-- 6. Stock. Invariant: tickets.sold_quantity = seats held by orders that are
--    pending or confirmed. Triggers keep it true whichever screen, function or
--    SQL statement changes an order or its holders. They replace the earlier
--    counters, which counted confirmed holders only and fought with these.
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

-- A holder joins a live order (booking, or "restore from bin") -> one seat is taken.
CREATE OR REPLACE FUNCTION public.holders_reserve_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o record; t record;
BEGIN
  SELECT event_id, payment_status INTO o FROM orders WHERE id = NEW.order_id;
  IF NOT FOUND OR o.payment_status NOT IN ('pending', 'confirmed') THEN RETURN NEW; END IF;
  PERFORM 1 FROM tickets WHERE event_id = o.event_id ORDER BY id FOR UPDATE;
  SELECT id, available_quantity, sold_quantity INTO t
    FROM tickets WHERE event_id = o.event_id AND type::text = NEW.ticket_type;
  IF NOT FOUND THEN RETURN NEW; END IF;   -- unknown ticket type: nothing to count
  IF t.available_quantity - t.sold_quantity < 1 THEN
    RAISE EXCEPTION 'insufficient_stock:%', NEW.ticket_type;
  END IF;
  UPDATE tickets SET sold_quantity = sold_quantity + 1 WHERE id = t.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ticket_holders_reserve_stock ON public.ticket_holders;
CREATE TRIGGER ticket_holders_reserve_stock
  AFTER INSERT ON public.ticket_holders
  FOR EACH ROW EXECUTE FUNCTION public.holders_reserve_stock();

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

-- A booking is moved to another event ("change event" in the admin screen) ->
-- its seats move with it, or the move is refused when the new event has no room.
CREATE OR REPLACE FUNCTION public.orders_move_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.payment_status NOT IN ('pending', 'confirmed') THEN RETURN NULL; END IF;
  -- lock both events in a fixed order so two opposite moves cannot deadlock
  PERFORM 1 FROM tickets WHERE event_id IN (OLD.event_id, NEW.event_id) ORDER BY event_id, id FOR UPDATE;
  UPDATE tickets t
     SET sold_quantity = GREATEST(0, t.sold_quantity - h.seats)
    FROM public._order_held_seats(NEW.id) h
   WHERE t.event_id = OLD.event_id AND t.type::text = h.ticket_type;
  IF NOT public._reserve_order_stock(NEW.id) THEN   -- reads the order's (new) event
    RAISE EXCEPTION 'insufficient_stock';
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS orders_move_stock ON public.orders;
CREATE TRIGGER orders_move_stock
  AFTER UPDATE OF event_id ON public.orders
  FOR EACH ROW WHEN (OLD.event_id IS DISTINCT FROM NEW.event_id)
  EXECUTE FUNCTION public.orders_move_stock();

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

-- Recompute sold_quantity from the orders themselves (repairs historic drift).
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

-- The existing availability helpers now read the same held-seat rule.
CREATE OR REPLACE FUNCTION public.get_event_ticket_counts(p_event_id uuid)
RETURNS TABLE (ticket_type text, confirmed_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT th.ticket_type, COUNT(*)::bigint
    FROM public.ticket_holders th
    JOIN public.orders o ON o.id = th.order_id
   WHERE o.event_id = p_event_id
     AND (o.payment_status = 'confirmed'
          OR (o.payment_status = 'pending' AND (o.payment_expires_at IS NULL OR o.payment_expires_at > now())))
   GROUP BY th.ticket_type
$$;

CREATE OR REPLACE FUNCTION public.reserve_tickets(p_event_id uuid, p_ticket_type text, p_quantity integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_available integer;
BEGIN
  SELECT t.available_quantity - t.sold_quantity INTO v_available
    FROM tickets t WHERE t.event_id = p_event_id AND t.type::text = p_ticket_type;
  IF v_available IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TICKET_NOT_FOUND',
                              'message', 'نوع التذكرة غير موجود لهذه الفعالية');
  END IF;
  IF v_available < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CAPACITY',
      'message', CASE WHEN v_available <= 0
        THEN 'عذراً، نفدت التذاكر من هذا النوع حالياً'
        ELSE 'عذراً، لا تتوفر تذاكر كافية. المتاح: ' || v_available || ' تذكرة' END,
      'available', GREATEST(v_available, 0), 'requested', p_quantity);
  END IF;
  RETURN jsonb_build_object('success', true, 'available', v_available,
                            'after_reservation', v_available - p_quantity);
END $$;

-- Per-person limit (5 normal + VIP per event): seats held by a pending order
-- that has not run out of time count, exactly like confirmed ones.
CREATE OR REPLACE FUNCTION public.get_person_ticket_count(p_id_number text, p_phone text, p_event_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id_key text;
  v_phone_key text;
  v_count integer;
BEGIN
  v_id_key := regexp_replace(COALESCE(p_id_number, ''), '\D', '', 'g');
  IF length(v_id_key) < 6 THEN v_id_key := NULL; END IF;
  v_phone_key := right(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 8);
  IF length(v_phone_key) < 8 THEN v_phone_key := NULL; END IF;
  IF v_id_key IS NULL AND v_phone_key IS NULL THEN RETURN 0; END IF;

  SELECT COUNT(*)::integer INTO v_count
    FROM public.ticket_holders th
    JOIN public.orders o ON o.id = th.order_id
   WHERE o.event_id = p_event_id
     AND th.ticket_type IN ('normal', 'vip')
     AND (o.payment_status = 'confirmed'
          OR (o.payment_status = 'pending' AND (o.payment_expires_at IS NULL OR o.payment_expires_at > now())))
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
END $$;

-- -----------------------------------------------------------------------------
-- 7. Order creation (the ONLY way an order comes into existence)
--    Prices come from the tickets table, seats are taken atomically (the holder
--    trigger above), the customer, the order and its holders are created in one
--    transaction.
-- -----------------------------------------------------------------------------
-- QTR-<event day>-<month>-<year>-<12 random hex>  (the date is the event's, in Qatar time)
CREATE OR REPLACE FUNCTION public.generate_reference(p_prefix text DEFAULT 'QTR', p_event_date timestamptz DEFAULT NULL)
RETURNS text LANGUAGE sql VOLATILE SET search_path = public, pg_temp AS $$
  SELECT p_prefix || '-'
      || to_char(COALESCE(p_event_date, now()) AT TIME ZONE 'Asia/Qatar', 'FMDD-FMMM-YYYY')
      || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
$$;

-- Frees seats held by unpaid online orders whose time ran out. Public pages call
-- it so a stale hold never makes the site look sold out; it only does what the
-- clock already decided.
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
    UPDATE orders SET payment_status = 'cancelled', payment_note = 'expired' WHERE id = r.id;
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
  p_return_origin text DEFAULT NULL,
  p_pos_user uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c_hold_minutes constant integer := 30;   -- how long an unpaid online order keeps its seats
  c_max_admission constant integer := 5;   -- vip + normal per online order
  c_max_parking constant integer := 5;
  c_min_online constant numeric := 3;      -- Sadad minimum, QAR
  v_events uuid[];
  v_event uuid;
  v_event_date timestamptz;
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

  SELECT e.is_active, e.event_date INTO v_active, v_event_date FROM events e WHERE e.id = v_event;
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
    v_ref := public.generate_reference(CASE WHEN p_source = 'pos' THEN 'POS' ELSE 'QTR' END, v_event_date);
    BEGIN
      INSERT INTO orders (customer_id, event_id, ticket_type, quantity, total_amount, payment_method,
                          payment_status, booking_reference, payment_expires_at, return_origin,
                          confirmed_by, confirmed_at, paid_at, pos_user_id, n8n_response_message, n8n_responded_at)
      VALUES (v_customer, v_event, v_first_type, v_qty, v_total, p_payment_method,
              v_status, v_ref, v_expires, p_return_origin,
              CASE WHEN p_source = 'pos' THEN p_actor END,
              CASE WHEN p_source = 'pos' THEN now() END,
              CASE WHEN p_source = 'pos' THEN now() END,
              CASE WHEN p_source = 'pos' THEN p_pos_user END,
              CASE WHEN p_source = 'pos' THEN 'طلب من نقطة البيع - POS' END,
              CASE WHEN p_source = 'pos' THEN now() END)
      RETURNING id INTO v_order;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 5 THEN RAISE; END IF;
    END;
  END LOOP;

  -- one holder per ticket; each insert takes its seat (trigger ticket_holders_reserve_stock)
  -- and passes the per-person limit trigger
  INSERT INTO ticket_holders (order_id, name, phone, country_code, nationality, ticket_type, qr_code, id_number)
  SELECT v_order,
         btrim(h.name),
         btrim(h.phone),
         COALESCE(NULLIF(btrim(COALESCE(h.country_code, '')), ''),
                  substring(h.phone FROM '^\s*(\+\d{1,4})\s'),
                  NULLIF(btrim(COALESCE(p_customer ->> 'country_code', '')), ''), '+974'),
         COALESCE(btrim(h.nationality), ''),
         t.type::text,
         v_ref || '-TKT' || lpad(h.ord::text, 2, '0'),
         NULLIF(btrim(COALESCE(h.id_number, '')), '')
    FROM ROWS FROM (jsonb_to_recordset(p_holders)
           AS (ticket_id uuid, name text, phone text, country_code text, nationality text, id_number text))
         WITH ORDINALITY AS h(ticket_id, name, phone, country_code, nationality, id_number, ord)
    JOIN tickets t ON t.id = h.ticket_id;

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
-- 8. Payment state transitions (called by the edge functions, service role only)
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
       SET payment_status = 'confirmed', payment_id = p_transaction_number,
           paid_at = now(), confirmed_at = now(), payment_note = NULL, payment_error_reason = NULL
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
  UPDATE orders
     SET payment_status = 'cancelled',
         payment_note = 'payment_failed',
         payment_error_reason = COALESCE(NULLIF(btrim(p_note), ''), 'payment_failed')
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
  UPDATE orders
     SET payment_status = 'cancelled',
         payment_note = COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), 'admin_cancelled')
   WHERE id = o.id;
  RETURN jsonb_build_object('result', 'cancelled', 'order_id', o.id);
END $$;

-- Throttle for the public "check my payment" button: returns the order only if
-- it is an unpaid online order that was not checked in the last N seconds.
-- A payment that failed or expired can still turn out to have been paid, so
-- those are checked too; a staff cancellation is final.
CREATE OR REPLACE FUNCTION public.claim_payment_check(p_booking_reference text, p_min_interval_seconds integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o record;
BEGIN
  UPDATE orders
     SET last_payment_check_at = now()
   WHERE booking_reference = p_booking_reference
     AND payment_method = 'sadad'
     AND (payment_status = 'pending'
          OR (payment_status = 'cancelled' AND payment_note IN ('payment_failed', 'expired', 'paid_after_expiry_no_stock')))
     AND created_at > now() - interval '3 days'
     AND (last_payment_check_at IS NULL
          OR last_payment_check_at < now() - make_interval(secs => p_min_interval_seconds))
  RETURNING id, booking_reference, total_amount, payment_status INTO o;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('order_id', o.id, 'booking_reference', o.booking_reference,
                            'total_amount', o.total_amount, 'payment_status', o.payment_status);
END $$;

-- -----------------------------------------------------------------------------
-- 9. What a customer may look up by their (unguessable) booking reference
--    A closed online payment is reported as 'failed' so the page can offer a retry.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_order_status(p_refs text[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'booking_reference', o.booking_reference,
      'payment_status', CASE
          WHEN o.payment_status = 'cancelled' AND o.payment_note IN ('payment_failed', 'expired', 'paid_after_expiry_no_stock')
            THEN 'failed'
          ELSE o.payment_status::text END,
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
-- 10. Function permissions: the browser may only call what is listed here.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION
  public._order_held_seats(uuid), public._release_order_stock(uuid), public._reserve_order_stock(uuid),
  public.orders_sync_stock(), public.orders_move_stock(), public.holders_reserve_stock(), public.holders_release_stock(),
  public.orders_release_stock_on_delete(), public._recount_ticket_stock(),
  public.generate_reference(text, timestamptz), public.expire_stale_orders(uuid),
  public.create_order(jsonb, jsonb, jsonb, public.payment_method, text, uuid, text, uuid),
  public.confirm_order_payment(text, text), public.mark_order_payment_failed(text, text),
  public.claim_payment_check(text, integer), public.cancel_order(uuid, text),
  public.recount_ticket_stock(), public.get_order_status(text[])
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.generate_reference(text, timestamptz), public.expire_stale_orders(uuid),
  public.create_order(jsonb, jsonb, jsonb, public.payment_method, text, uuid, text, uuid),
  public.confirm_order_payment(text, text), public.mark_order_payment_failed(text, text),
  public.claim_payment_check(text, integer)
TO service_role;

-- admin screens call these with the signed-in admin's own session
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text), public.recount_ticket_stock() TO authenticated;

-- customers look their own order up by reference
GRANT EXECUTE ON FUNCTION public.get_order_status(text[]) TO anon, authenticated;

-- public pages release expired holds before showing availability
CREATE OR REPLACE FUNCTION public.release_expired_holds(p_event uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.expire_stale_orders(p_event)
$$;
REVOKE ALL ON FUNCTION public.release_expired_holds(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_expired_holds(uuid) TO anon, authenticated, service_role;

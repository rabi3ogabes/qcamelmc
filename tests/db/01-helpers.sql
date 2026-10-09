-- Tiny assertion library + fixtures for the SQL tests. Lives in schema "t",
-- never part of the shipped migrations.

CREATE SCHEMA IF NOT EXISTS t;
GRANT USAGE ON SCHEMA t TO PUBLIC;

CREATE OR REPLACE FUNCTION t.ok(cond boolean, msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS TRUE THEN RAISE NOTICE 'ok - %', msg;
  ELSE RAISE EXCEPTION 'not ok - %', msg;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION t.eq(actual anyelement, expected anyelement, msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS NOT DISTINCT FROM expected THEN RAISE NOTICE 'ok - %', msg;
  ELSE RAISE EXCEPTION 'not ok - % (expected %, got %)', msg, expected, actual;
  END IF;
END $$;

-- Runs sql as the CURRENT role and requires it to fail with a message or
-- SQLSTATE containing `fragment`.
CREATE OR REPLACE FUNCTION t.throws(sql text, fragment text, msg text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE got text;
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    got := SQLSTATE || ' ' || SQLERRM;
    IF position(fragment IN got) > 0 THEN
      RAISE NOTICE 'ok - %', msg;
      RETURN;
    END IF;
    RAISE EXCEPTION 'not ok - % (expected error containing "%", got "%")', msg, fragment, got;
  END;
  RAISE EXCEPTION 'not ok - % (expected an error containing "%" but statement succeeded)', msg, fragment;
END $$;

-- Executes sql as the current role and returns how many rows it produced
-- (works for SELECT as well as UPDATE/INSERT/DELETE ... RETURNING / data-modifying CTEs).
CREATE OR REPLACE FUNCTION t.rows(sql text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO PUBLIC;

-- Fixtures with fixed ids so tests can refer to them directly.
--   admin  : 00000000-0000-4000-8000-0000000000a1 (in admin_users)
--   member : 00000000-0000-4000-8000-0000000000b1 (plain authenticated user)
--   event A: a0000000-0000-4000-8000-000000000001 (active)   vip 10 @200, normal 10 @100, parking 10 @10
--   event B: b0000000-0000-4000-8000-000000000001 (active)   normal 10 @50
--   event X: c0000000-0000-4000-8000-000000000001 (inactive) normal 10 @50
CREATE OR REPLACE FUNCTION t.seed() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-4000-8000-0000000000a1', 'admin@example.com'),
    ('00000000-0000-4000-8000-0000000000b1', 'member@example.com');
  INSERT INTO public.admin_users (id, email) VALUES ('00000000-0000-4000-8000-0000000000a1', 'admin@example.com');
  -- the single settings row (truncating events cascades to it)
  INSERT INTO public.settings (id) SELECT gen_random_uuid() WHERE NOT EXISTS (SELECT 1 FROM public.settings);

  INSERT INTO public.events (id, title, event_date, location, is_active) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'Event A', now() + interval '30 days', 'Doha', true),
    ('b0000000-0000-4000-8000-000000000001', 'Event B', now() + interval '40 days', 'Doha', true),
    ('c0000000-0000-4000-8000-000000000001', 'Event X', now() + interval '50 days', 'Doha', false);

  INSERT INTO public.tickets (id, event_id, type, price, available_quantity, sold_quantity) VALUES
    ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'vip', 200, 10, 0),
    ('a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'normal', 100, 10, 0),
    ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'parking', 10, 10, 0),
    ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'normal', 50, 10, 0),
    ('c2000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'normal', 50, 10, 0);
END $$;

CREATE OR REPLACE FUNCTION t.customer() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('name', 'Test Customer', 'email', 'c@example.com', 'phone', '5551 2345',
                            'country_code', '+974', 'nationality', 'قطر', 'id_number', '29850123456')
$$;

-- Holders for a list of (ticket_id, count) pairs, e.g. t.holders('{"<uuid>": 2}').
-- Every holder is a different person (unique ID number and phone), so the
-- per-person ticket limit only fires in tests that ask for it.
CREATE SEQUENCE IF NOT EXISTS t.person_seq;
GRANT USAGE ON SEQUENCE t.person_seq TO PUBLIC;

CREATE OR REPLACE FUNCTION t.holders(spec jsonb) RETURNS jsonb LANGUAGE sql VOLATILE AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ticket_id', p.ticket, 'name', 'Holder ' || p.n, 'phone', '5' || lpad(p.n::text, 7, '0'),
    'country_code', '+974', 'nationality', 'قطر', 'id_number', '2' || lpad(p.n::text, 10, '0'))), '[]'::jsonb)
  FROM (SELECT k.key AS ticket, nextval('t.person_seq') AS n
          FROM jsonb_each_text(spec) k, generate_series(1, k.value::int)) p
$$;

-- One holder with chosen identity, for the per-person limit tests.
CREATE OR REPLACE FUNCTION t.holder(ticket uuid, id_number text, phone text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('ticket_id', ticket, 'name', 'Same Person', 'phone', COALESCE(phone, '55510000'),
                            'country_code', '+974', 'nationality', 'قطر', 'id_number', id_number)
$$;

-- Items array from the same spec.
CREATE OR REPLACE FUNCTION t.items(spec jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('ticket_id', k.key, 'quantity', k.value::int)), '[]'::jsonb)
  FROM jsonb_each_text(spec) k
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO PUBLIC;

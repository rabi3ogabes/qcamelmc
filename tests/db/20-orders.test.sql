-- create_order: server-side pricing, atomic stock, limits.
BEGIN;
SELECT t.seed();
SET LOCAL ROLE service_role;

-- ---------- happy path: price comes from the database ----------------------
CREATE TEMP TABLE r1 AS
SELECT public.create_order(
  t.customer(),
  t.items('{"a1000000-0000-4000-8000-000000000001":1,"a2000000-0000-4000-8000-000000000001":2}'),
  t.holders('{"a1000000-0000-4000-8000-000000000001":1,"a2000000-0000-4000-8000-000000000001":2}'),
  'sadad'
) AS j;

SELECT t.eq((j ->> 'total_amount')::numeric, 400::numeric, 'total = 1 vip(200) + 2 normal(100), from DB prices') FROM r1;
SELECT t.eq(j ->> 'payment_status', 'pending', 'online order starts pending') FROM r1;
SELECT t.ok((j ->> 'booking_reference') ~ '^QTR-[0-9A-F]{12}$', 'reference is QTR- + 12 random hex chars') FROM r1;
SELECT t.eq(jsonb_array_length(j -> 'holders'), 3, 'one holder per ticket') FROM r1;
SELECT t.ok(
  (SELECT bool_and((h ->> 'qr_code') ~ ('^' || (j ->> 'booking_reference') || '-TKT0[1-3]$'))
     FROM jsonb_array_elements(j -> 'holders') h), 'QR codes are <ref>-TKT01..03') FROM r1;
SELECT t.eq((SELECT sold_quantity FROM public.tickets WHERE type = 'vip' AND event_id = 'a0000000-0000-4000-8000-000000000001'), 1,
            'vip stock reserved');
SELECT t.eq((SELECT sold_quantity FROM public.tickets WHERE type = 'normal' AND event_id = 'a0000000-0000-4000-8000-000000000001'), 2,
            'normal stock reserved');
SELECT t.eq((SELECT sold_quantity FROM public.tickets WHERE type = 'parking' AND event_id = 'a0000000-0000-4000-8000-000000000001'), 0,
            'untouched ticket type unchanged');
SELECT t.eq((SELECT ticket_type::text FROM public.orders WHERE id = (j ->> 'order_id')::uuid), 'vip',
            'order is labelled with its most expensive ticket type') FROM r1;
SELECT t.ok(
  (SELECT payment_expires_at BETWEEN now() + interval '29 minutes' AND now() + interval '31 minutes'
     FROM public.orders WHERE id = (j ->> 'order_id')::uuid), 'online order reserves stock for 30 minutes') FROM r1;
SELECT t.eq((SELECT id_number FROM public.customers c JOIN public.orders o ON o.customer_id = c.id
              WHERE o.id = (j ->> 'order_id')::uuid), '29850123456', 'customer id number stored') FROM r1;

-- ---------- cash at venue (web): pending, no expiry ------------------------
CREATE TEMP TABLE r2 AS
SELECT public.create_order(
  t.customer(), t.items('{"a2000000-0000-4000-8000-000000000001":1}'),
  t.holders('{"a2000000-0000-4000-8000-000000000001":1}'), 'cash_pos') AS j;
SELECT t.eq(j ->> 'payment_status', 'pending', 'cash-at-venue order is pending') FROM r2;
SELECT t.ok((SELECT payment_expires_at IS NULL FROM public.orders WHERE id = (j ->> 'order_id')::uuid),
            'cash-at-venue reservations do not auto-expire') FROM r2;

-- ---------- POS: confirmed immediately, attributed to the admin ------------
CREATE TEMP TABLE r3 AS
SELECT public.create_order(
  t.customer(), t.items('{"a2000000-0000-4000-8000-000000000001":1}'),
  t.holders('{"a2000000-0000-4000-8000-000000000001":1}'), 'cash_pos', 'pos',
  '00000000-0000-4000-8000-0000000000a1') AS j;
SELECT t.eq(j ->> 'payment_status', 'confirmed', 'POS order is confirmed at once') FROM r3;
SELECT t.ok((j ->> 'booking_reference') ~ '^POS-[0-9A-F]{12}$', 'POS references use the POS- prefix') FROM r3;
SELECT t.eq((SELECT confirmed_by FROM public.orders WHERE id = (j ->> 'order_id')::uuid),
            '00000000-0000-4000-8000-0000000000a1'::uuid, 'POS order records the admin') FROM r3;
SELECT t.ok((SELECT paid_at IS NOT NULL FROM public.orders WHERE id = (j ->> 'order_id')::uuid), 'POS order has paid_at') FROM r3;

-- ---------- holder phone country code --------------------------------------
CREATE TEMP TABLE r4 AS
SELECT public.create_order(
  t.customer(), t.items('{"b2000000-0000-4000-8000-000000000001":1}'),
  jsonb_build_array(jsonb_build_object('ticket_id', 'b2000000-0000-4000-8000-000000000001', 'name', 'Saudi Guest',
                    'phone', '+966 5551 0001', 'nationality', 'السعودية', 'id_number', 'SA123456')),
  'cash_pos') AS j;
SELECT t.eq((SELECT country_code FROM public.ticket_holders WHERE order_id = (j ->> 'order_id')::uuid), '+966',
            'holder country code is read from the phone') FROM r4;

-- ---------- rejections leave no trace --------------------------------------
CREATE TEMP TABLE before AS
SELECT (SELECT count(*) FROM public.orders) AS orders, (SELECT count(*) FROM public.customers) AS customers,
       (SELECT count(*) FROM public.ticket_holders) AS holders,
       (SELECT sum(sold_quantity) FROM public.tickets) AS sold;

SELECT t.throws(
  $$SELECT public.create_order(t.customer(), t.items('{"a2000000-0000-4000-8000-000000000001":11}'),
        t.holders('{"a2000000-0000-4000-8000-000000000001":11}'), 'cash_pos', 'pos')$$,
  'insufficient_stock:normal', 'cannot sell more than the remaining stock');

SELECT t.throws(
  $$SELECT public.create_order(t.customer(), t.items('{"a1000000-0000-4000-8000-000000000001":3,"a2000000-0000-4000-8000-000000000001":3}'),
        t.holders('{"a1000000-0000-4000-8000-000000000001":3,"a2000000-0000-4000-8000-000000000001":3}'), 'sadad')$$,
  'quantity_limit_exceeded', 'online orders: at most 5 admission tickets combined');

SELECT t.throws(
  $$SELECT public.create_order(t.customer(), t.items('{"a3000000-0000-4000-8000-000000000001":6}'),
        t.holders('{"a3000000-0000-4000-8000-000000000001":6}'), 'sadad')$$,
  'quantity_limit_exceeded', 'online orders: at most 5 parking passes');

SELECT t.throws(
  $$SELECT public.create_order(t.customer(), t.items('{"a2000000-0000-4000-8000-000000000001":2}'),
        t.holders('{"a2000000-0000-4000-8000-000000000001":1}'), 'sadad')$$,
  'holders_mismatch', 'every ticket needs a holder');

SELECT t.throws(
  $$SELECT public.create_order(t.customer(), t.items('{"a2000000-0000-4000-8000-000000000001":1,"b2000000-0000-4000-8000-000000000001":1}'),
        t.holders('{"a2000000-0000-4000-8000-000000000001":1,"b2000000-0000-4000-8000-000000000001":1}'), 'sadad')$$,
  'invalid_tickets', 'one order cannot span two events');

SELECT t.throws(
  $$SELECT public.create_order(t.customer(), t.items('{"99999999-9999-4999-8999-999999999999":1}'),
        t.holders('{"99999999-9999-4999-8999-999999999999":1}'), 'sadad')$$,
  'invalid_tickets', 'unknown ticket id is rejected');

SELECT t.throws(
  $$SELECT public.create_order(t.customer(), t.items('{"c2000000-0000-4000-8000-000000000001":1}'),
        t.holders('{"c2000000-0000-4000-8000-000000000001":1}'), 'sadad')$$,
  'event_not_available', 'online sales for an inactive event are refused');

SELECT t.throws(
  $$SELECT public.create_order(t.customer(), '[]'::jsonb, '[]'::jsonb, 'sadad')$$,
  'invalid_request', 'empty orders are refused');

SELECT t.throws(
  $$SELECT public.create_order(t.customer(), t.items('{"a2000000-0000-4000-8000-000000000001":1}'),
        t.holders('{"a2000000-0000-4000-8000-000000000001":1}'), 'sadad', 'admin')$$,
  'invalid_source', 'unknown source is refused');

SELECT t.ok(
  (SELECT (SELECT count(*) FROM public.orders) = b.orders AND (SELECT count(*) FROM public.customers) = b.customers
      AND (SELECT count(*) FROM public.ticket_holders) = b.holders
      AND (SELECT sum(sold_quantity) FROM public.tickets) = b.sold FROM before b),
  'rejected orders created no customers, orders, holders or stock changes');

-- ---------- minimum online amount (3 QAR) ----------------------------------
UPDATE public.tickets SET price = 2 WHERE id = 'a3000000-0000-4000-8000-000000000001';
SELECT t.throws(
  $$SELECT public.create_order(t.customer(), t.items('{"a3000000-0000-4000-8000-000000000001":1}'),
        t.holders('{"a3000000-0000-4000-8000-000000000001":1}'), 'sadad')$$,
  'below_minimum_amount', 'Sadad needs at least 3 QAR');
SELECT t.ok(
  (public.create_order(t.customer(), t.items('{"a3000000-0000-4000-8000-000000000001":1}'),
        t.holders('{"a3000000-0000-4000-8000-000000000001":1}'), 'cash_pos') ->> 'total_amount')::numeric = 2,
  'the minimum only applies to online payment');

-- ---------- stale online reservations are released automatically ----------
CREATE TEMP TABLE r5 AS
SELECT public.create_order(
  t.customer(), t.items('{"b2000000-0000-4000-8000-000000000001":2}'),
  t.holders('{"b2000000-0000-4000-8000-000000000001":2}'), 'sadad') AS j;
SELECT t.eq((SELECT sold_quantity FROM public.tickets WHERE id = 'b2000000-0000-4000-8000-000000000001'), 3,
            'event B normal: 1 (cash) + 2 (online) reserved');
UPDATE public.orders SET payment_expires_at = now() - interval '1 minute'
 WHERE id = (SELECT (j ->> 'order_id')::uuid FROM r5);
-- a sale for ANOTHER event does not touch it (expiry is scoped per event to avoid cross-event lock cycles)
SELECT public.create_order(t.customer(), t.items('{"a2000000-0000-4000-8000-000000000001":1}'),
                           t.holders('{"a2000000-0000-4000-8000-000000000001":1}'), 'cash_pos');
SELECT t.eq((SELECT payment_status::text FROM public.orders WHERE id = (SELECT (j ->> 'order_id')::uuid FROM r5)), 'pending',
            'a sale for a different event leaves it alone');
-- the next sale for the SAME event frees it
SELECT public.create_order(t.customer(), t.items('{"b2000000-0000-4000-8000-000000000001":1}'),
                           t.holders('{"b2000000-0000-4000-8000-000000000001":1}'), 'cash_pos');
SELECT t.eq((SELECT payment_status::text FROM public.orders WHERE id = (SELECT (j ->> 'order_id')::uuid FROM r5)), 'failed',
            'expired online order is marked failed on the next sale of that event');
SELECT t.eq((SELECT sold_quantity FROM public.tickets WHERE id = 'b2000000-0000-4000-8000-000000000001'), 2,
            'its seats went back on sale (1 earlier cash sale + the new one)');

RESET ROLE;
ROLLBACK;

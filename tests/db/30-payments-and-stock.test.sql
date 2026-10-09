-- Payment confirmation, expiry and the stock invariant:
--   sold_quantity == tickets held by pending/confirmed orders
BEGIN;
SELECT t.seed();
SET LOCAL ROLE service_role;

CREATE FUNCTION pg_temp.sold() RETURNS int LANGUAGE sql AS
$$ SELECT sold_quantity FROM public.tickets WHERE id = 'b2000000-0000-4000-8000-000000000001' $$;

CREATE FUNCTION pg_temp.online(qty int) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.create_order(t.customer(),
    t.items(jsonb_build_object('b2000000-0000-4000-8000-000000000001', qty)),
    t.holders(jsonb_build_object('b2000000-0000-4000-8000-000000000001', qty)), 'sadad')
$$;

CREATE FUNCTION pg_temp.status(ref text) RETURNS text LANGUAGE sql AS
$$ SELECT payment_status::text FROM public.orders WHERE booking_reference = ref $$;

-- ---------- confirm ---------------------------------------------------------
CREATE TEMP TABLE o1 AS SELECT pg_temp.online(2) AS j;
GRANT SELECT ON o1 TO PUBLIC;
SELECT t.eq(pg_temp.sold(), 2, 'two seats reserved for the online order');

SELECT t.eq(public.confirm_order_payment((SELECT j ->> 'booking_reference' FROM o1), 'SD-1') ->> 'result', 'confirmed',
            'first confirmation succeeds');
SELECT t.eq(pg_temp.status((SELECT j ->> 'booking_reference' FROM o1)), 'confirmed', 'order is confirmed');
SELECT t.eq((SELECT payment_id FROM public.orders WHERE booking_reference = (SELECT j ->> 'booking_reference' FROM o1)),
            'SD-1', 'Sadad transaction number stored');
SELECT t.ok((SELECT paid_at IS NOT NULL FROM public.orders WHERE booking_reference = (SELECT j ->> 'booking_reference' FROM o1)),
            'paid_at stamped');
SELECT t.eq(pg_temp.sold(), 2, 'confirming does not change stock');

SELECT t.eq(public.confirm_order_payment((SELECT j ->> 'booking_reference' FROM o1), 'SD-1') ->> 'result', 'already_confirmed',
            'a replayed callback/webhook is harmless');
SELECT t.eq(public.confirm_order_payment((SELECT j ->> 'booking_reference' FROM o1), 'SD-OTHER') ->> 'result', 'already_confirmed',
            'a second transaction number cannot overwrite the first');
SELECT t.eq((SELECT payment_id FROM public.orders WHERE booking_reference = (SELECT j ->> 'booking_reference' FROM o1)),
            'SD-1', 'original transaction number kept');
SELECT t.eq(public.confirm_order_payment('QTR-DOESNOTEXIST', 'SD-9') ->> 'result', 'order_not_found', 'unknown reference');

-- one real payment cannot confirm two different orders
CREATE TEMP TABLE o2 AS SELECT pg_temp.online(1) AS j;
GRANT SELECT ON o2 TO PUBLIC;
SELECT t.eq(public.confirm_order_payment((SELECT j ->> 'booking_reference' FROM o2), 'SD-1') ->> 'result',
            'transaction_already_used', 'a transaction number can only pay one order');
SELECT t.eq(pg_temp.status((SELECT j ->> 'booking_reference' FROM o2)), 'pending', 'the other order stays pending');

-- ---------- failure ---------------------------------------------------------
SELECT t.eq(pg_temp.sold(), 3, 'three seats held (2 confirmed + 1 pending)');
SELECT t.eq(public.mark_order_payment_failed((SELECT j ->> 'booking_reference' FROM o2), 'declined') ->> 'result', 'failed',
            'a pending order can be failed');
SELECT t.eq(pg_temp.sold(), 2, 'failing releases the stock');
SELECT t.eq(public.mark_order_payment_failed((SELECT j ->> 'booking_reference' FROM o2)) ->> 'result', 'not_pending', 'failing twice is a no-op');
SELECT t.eq(pg_temp.sold(), 2, 'no double release');
SELECT t.eq(public.mark_order_payment_failed((SELECT j ->> 'booking_reference' FROM o1)) ->> 'result', 'not_pending',
            'a confirmed order can never be failed by a gateway message');
SELECT t.eq(pg_temp.status((SELECT j ->> 'booking_reference' FROM o1)), 'confirmed', 'confirmed order untouched');

-- ---------- expiry ----------------------------------------------------------
CREATE TEMP TABLE o3 AS SELECT pg_temp.online(1) AS j;
GRANT SELECT ON o3 TO PUBLIC;
CREATE TEMP TABLE o_cash AS
SELECT public.create_order(t.customer(), t.items('{"b2000000-0000-4000-8000-000000000001":1}'),
                           t.holders('{"b2000000-0000-4000-8000-000000000001":1}'), 'cash_pos') AS j;
GRANT SELECT ON o_cash TO PUBLIC;
SELECT t.eq(pg_temp.sold(), 4, '2 confirmed + 1 online pending + 1 cash pending');
UPDATE public.orders SET payment_expires_at = now() - interval '1 minute'
 WHERE booking_reference IN ((SELECT j ->> 'booking_reference' FROM o3), (SELECT j ->> 'booking_reference' FROM o1));
SELECT t.eq(public.expire_stale_orders(), 1, 'only the pending online order expires (confirmed + cash are exempt)');
SELECT t.eq(pg_temp.status((SELECT j ->> 'booking_reference' FROM o3)), 'failed', 'expired order is failed');
SELECT t.eq(pg_temp.status((SELECT j ->> 'booking_reference' FROM o_cash)), 'pending', 'cash reservation kept');
SELECT t.eq(pg_temp.sold(), 3, 'expiry released its seat');
SELECT t.eq(public.expire_stale_orders(), 0, 'expiry is idempotent');

-- ---------- paying after the reservation expired ----------------------------
SELECT t.eq(public.confirm_order_payment((SELECT j ->> 'booking_reference' FROM o3), 'SD-LATE') ->> 'result', 'confirmed',
            'a late payment still confirms when seats remain');
SELECT t.eq(pg_temp.sold(), 4, 'its seat is re-reserved');

CREATE TEMP TABLE o4 AS SELECT pg_temp.online(2) AS j;
GRANT SELECT ON o4 TO PUBLIC;
UPDATE public.orders SET payment_expires_at = now() - interval '1 minute'
 WHERE booking_reference = (SELECT j ->> 'booking_reference' FROM o4);
SELECT public.expire_stale_orders();
UPDATE public.tickets SET sold_quantity = 10 WHERE id = 'b2000000-0000-4000-8000-000000000001';   -- sold out meanwhile
SELECT t.eq(public.confirm_order_payment((SELECT j ->> 'booking_reference' FROM o4), 'SD-NOSTOCK') ->> 'result',
            'paid_after_expiry_no_stock', 'late payment with no seats left is flagged, not silently confirmed');
SELECT t.eq(pg_temp.status((SELECT j ->> 'booking_reference' FROM o4)), 'failed', 'order stays failed');
SELECT t.eq((SELECT payment_id FROM public.orders WHERE booking_reference = (SELECT j ->> 'booking_reference' FROM o4)),
            'SD-NOSTOCK', 'payment is recorded so staff can refund it');
SELECT t.eq((SELECT payment_note FROM public.orders WHERE booking_reference = (SELECT j ->> 'booking_reference' FROM o4)),
            'paid_after_expiry_no_stock', 'note tells staff what to do');
SELECT t.eq(pg_temp.sold(), 10, 'stock not over-sold');
UPDATE public.tickets SET sold_quantity = 4 WHERE id = 'b2000000-0000-4000-8000-000000000001';

RESET ROLE;

-- ---------- the database keeps stock right whichever screen changes an order
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);

SELECT t.eq(
  t.rows($$WITH u AS (UPDATE public.orders SET payment_status = 'cancelled'
                      WHERE booking_reference = (SELECT booking_reference FROM public.orders WHERE payment_method = 'cash_pos' LIMIT 1)
                      RETURNING 1) SELECT * FROM u$$), 1::bigint, 'admin can cancel an order directly');
RESET ROLE;
SELECT t.eq(pg_temp.sold(), 3, 'a cancel (any path) releases the seat');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
SELECT t.eq(
  t.rows($$WITH u AS (UPDATE public.orders SET payment_status = 'pending' WHERE payment_method = 'cash_pos' RETURNING 1) SELECT * FROM u$$),
  1::bigint, 'admin can reinstate it');
RESET ROLE;
SELECT t.eq(pg_temp.sold(), 4, 'reinstating re-reserves the seat');

-- reinstating when sold out is refused
UPDATE public.orders SET payment_status = 'cancelled' WHERE payment_method = 'cash_pos';
UPDATE public.tickets SET sold_quantity = 10 WHERE id = 'b2000000-0000-4000-8000-000000000001';
SELECT t.throws($$UPDATE public.orders SET payment_status = 'pending' WHERE payment_method = 'cash_pos'$$,
                'insufficient_stock', 'cannot reinstate an order when the tickets are gone');
UPDATE public.tickets SET sold_quantity = 3 WHERE id = 'b2000000-0000-4000-8000-000000000001';

-- deleting holders / orders releases only seats that were actually held
CREATE TEMP TABLE o5 AS SELECT pg_temp.online(2) AS j;
GRANT SELECT ON o5 TO PUBLIC;      -- sold 5
SELECT t.eq(pg_temp.sold(), 5, 'two more held');
DELETE FROM public.ticket_holders WHERE id = (SELECT (j -> 'holders' -> 0 ->> 'id')::uuid FROM o5);
SELECT t.eq(pg_temp.sold(), 4, 'deleting one holder of an active order releases one seat');
DELETE FROM public.orders WHERE booking_reference = (SELECT j ->> 'booking_reference' FROM o5);
SELECT t.eq(pg_temp.sold(), 3, 'deleting the order releases the remaining holder');
DELETE FROM public.orders WHERE payment_method = 'cash_pos' AND payment_status = 'cancelled';
SELECT t.eq(pg_temp.sold(), 3, 'deleting an already-cancelled order does not release twice');

-- ---------- admin cancel RPC -------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
CREATE TEMP TABLE o6 AS
SELECT public.cancel_order((SELECT id FROM public.orders WHERE booking_reference = (SELECT j ->> 'booking_reference' FROM o1)),
                           'customer asked') AS j;
SELECT t.eq(j ->> 'result', 'cancelled', 'admin cancel RPC works') FROM o6;
SELECT t.eq(public.cancel_order((SELECT id FROM public.orders WHERE booking_reference = (SELECT j ->> 'booking_reference' FROM o1))) ->> 'result',
            'already_inactive', 'cancelling twice is a no-op');
RESET ROLE;
SELECT t.eq(pg_temp.sold(), 1, 'cancel RPC released the 2 seats (3 - 2 = 1)');

-- ---------- recount repairs drift -------------------------------------------
UPDATE public.tickets SET sold_quantity = 99;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
SELECT public.recount_ticket_stock();
RESET ROLE;
SELECT t.eq(pg_temp.sold(), (SELECT count(*)::int FROM public.ticket_holders th JOIN public.orders o ON o.id = th.order_id
                              WHERE o.payment_status IN ('pending', 'confirmed') AND th.ticket_type = 'normal'
                                AND o.event_id = 'b0000000-0000-4000-8000-000000000001'),
            'recount equals the seats actually held');

-- ---------- throttle for the public "check my payment" button ---------------
SET LOCAL ROLE service_role;
CREATE TEMP TABLE o7 AS SELECT pg_temp.online(1) AS j;
GRANT SELECT ON o7 TO PUBLIC;
SELECT t.ok(public.claim_payment_check((SELECT j ->> 'booking_reference' FROM o7), 10) IS NOT NULL,
            'first payment check is allowed');
SELECT t.ok(public.claim_payment_check((SELECT j ->> 'booking_reference' FROM o7), 10) IS NULL,
            'a second check inside the interval is refused');
SELECT t.ok(public.claim_payment_check((SELECT j ->> 'booking_reference' FROM o3), 0) IS NULL,
            'confirmed orders are never re-checked');
SELECT t.ok(public.claim_payment_check('QTR-NOPE', 0) IS NULL, 'unknown order is refused');
RESET ROLE;

-- ---------- public order lookup ---------------------------------------------
SET LOCAL ROLE anon;
CREATE TEMP TABLE lk AS
SELECT public.get_order_status(ARRAY[(SELECT j ->> 'booking_reference' FROM o3), 'QTR-NOPE', 'bad ref!']) AS j;
SELECT t.eq(jsonb_array_length(j), 1, 'only the real reference is returned') FROM lk;
SELECT t.eq(j -> 0 ->> 'payment_status', 'confirmed', 'status visible by reference') FROM lk;
SELECT t.eq(j -> 0 -> 'event' ->> 'title', 'Event B', 'event title included') FROM lk;
SELECT t.eq(j -> 0 ->> 'event_id', 'b0000000-0000-4000-8000-000000000001', 'event id included (to link back to the event)') FROM lk;
SELECT t.ok(jsonb_typeof(j -> 0 -> 'tickets') = 'array' AND jsonb_array_length(j -> 0 -> 'tickets') = 1, 'tickets listed') FROM lk;
SELECT t.ok(NOT (j -> 0 ? 'customer_id') AND NOT (j -> 0 ? 'id_number'), 'no internal ids or personal data leak') FROM lk;
RESET ROLE;

ROLLBACK;

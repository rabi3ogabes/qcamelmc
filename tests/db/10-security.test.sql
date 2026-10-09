-- Who can see and do what. Runs after ALL migrations (including the one that
-- closes the open doors).
BEGIN;
SELECT t.seed();

INSERT INTO public.customers (id, name, email, phone, id_number)
VALUES ('d0000000-0000-4000-8000-000000000001', 'Real Person', 'real@example.com', '5551', '29850123456');
INSERT INTO public.orders (id, customer_id, event_id, ticket_type, quantity, total_amount,
                           payment_method, payment_status, booking_reference)
VALUES ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'normal', 1, 100, 'sadad', 'confirmed', 'QTR-1-1-2027-SEC000000001');
INSERT INTO public.ticket_holders (order_id, name, phone, nationality, ticket_type, qr_code, id_number)
VALUES ('e0000000-0000-4000-8000-000000000001', 'Real Person', '5551', 'قطر', 'normal',
        'QTR-1-1-2027-SEC000000001-TKT01', '29850123456');
UPDATE public.settings SET sadad_secret = 'topsecret', webhook_url = 'https://n8n.example/hook';

-- ===================== anonymous visitor ===================================
SET LOCAL ROLE anon;

-- reading: the rows simply are not visible
SELECT t.eq(t.rows('SELECT 1 FROM public.customers'), 0::bigint, 'anon sees no customers');
SELECT t.eq(t.rows('SELECT 1 FROM public.orders'), 0::bigint, 'anon sees no orders');
SELECT t.eq(t.rows('SELECT 1 FROM public.ticket_holders'), 0::bigint, 'anon sees no ticket holders');
SELECT t.eq(t.rows('SELECT 1 FROM public.admin_users'), 0::bigint, 'anon sees no admin accounts');
SELECT t.throws('SELECT * FROM public.payment_events', '42501', 'anon cannot read payment events');
SELECT t.throws('SELECT sadad_secret FROM public.settings', '42501', 'anon cannot read gateway secrets');
SELECT t.throws('SELECT webhook_url FROM public.settings', '42501', 'anon cannot read the webhook URL');

-- writing: the old open doors are shut
SELECT t.throws(
  $$INSERT INTO public.customers (name, email, phone) VALUES ('x', 'x@x.com', '1')$$,
  '42501', 'anon cannot insert customers');
SELECT t.throws(
  $$INSERT INTO public.orders (customer_id, event_id, ticket_type, quantity, total_amount, payment_method,
                               payment_status, booking_reference)
    VALUES ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'vip', 1, 200,
            'sadad', 'confirmed', 'QTR-FREE')$$,
  '42501', 'anon cannot mint a confirmed order');
SELECT t.throws(
  $$INSERT INTO public.ticket_holders (order_id, name, phone, nationality, ticket_type)
    VALUES ('e0000000-0000-4000-8000-000000000001', 'x', '1', 'x', 'vip')$$,
  '42501', 'anon cannot insert ticket holders');
SELECT t.eq(
  t.rows($$WITH u AS (UPDATE public.orders SET payment_status = 'confirmed' RETURNING 1) SELECT * FROM u$$),
  0::bigint, 'anon cannot change orders');
SELECT t.throws(
  $$SELECT public.create_pos_booking('{"name":"x","phone":"1"}'::jsonb, 'a0000000-0000-4000-8000-000000000001',
        0, 'POS-FREE', '[{"name":"x","phone":"1","ticket_type":"vip"}]'::jsonb, NULL)$$,
  '42501', 'anon cannot book "POS" tickets for free');
SELECT t.throws(
  $$SELECT public.create_public_booking('{"name":"x","phone":"1"}'::jsonb, 'a0000000-0000-4000-8000-000000000001',
        'sadad', 0, 'QTR-FREE', '[{"name":"x","phone":"1","ticket_type":"vip"}]'::jsonb)$$,
  '42501', 'anon cannot call the old public booking function');

-- what a visitor legitimately needs still works
SELECT t.eq(t.rows('SELECT 1 FROM public.events'), 2::bigint, 'anon sees only active events');
SELECT t.ok(t.rows('SELECT 1 FROM public.tickets') >= 4, 'anon can read ticket prices');
SELECT t.ok(t.rows('SELECT logo_url, header_bg_color, hero_text FROM public.public_settings') >= 1,
            'anon can read the public branding view');
SELECT t.ok(NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'public_settings' AND column_name IN
                           ('sadad_secret', 'sadad_api_key', 'sadad_merchant_id', 'webhook_url', 'site_url')),
            'the public branding view carries no secrets');
SELECT t.ok((public.reserve_tickets('a0000000-0000-4000-8000-000000000001', 'normal', 1) ->> 'success')::boolean,
            'availability check is public');
SELECT t.ok(public.get_person_ticket_count('29850123456', NULL, 'a0000000-0000-4000-8000-000000000001') >= 0,
            'per-person limit pre-check is public');
SELECT t.ok(public.release_expired_holds('a0000000-0000-4000-8000-000000000001') >= 0,
            'public pages can release expired holds');

-- privileged functions are not callable from the browser
SELECT t.throws($$SELECT public.create_order('{}'::jsonb, '[]'::jsonb, '[]'::jsonb, 'sadad')$$,
                '42501', 'anon cannot call create_order');
SELECT t.throws($$SELECT public.confirm_order_payment('QTR-X', 'SD1')$$, '42501', 'anon cannot confirm payments');
SELECT t.throws($$SELECT public.mark_order_payment_failed('QTR-X')$$, '42501', 'anon cannot fail payments');
SELECT t.throws($$SELECT public.expire_stale_orders()$$, '42501', 'anon cannot run the expiry job directly');
SELECT t.throws($$SELECT public.cancel_order('e0000000-0000-4000-8000-000000000001')$$, '42501', 'anon cannot cancel orders');
SELECT t.throws($$SELECT public.recount_ticket_stock()$$, '42501', 'anon cannot recount stock');
SELECT t.throws($$SELECT public.claim_payment_check('QTR-X', 0)$$, '42501', 'anon cannot trigger payment checks');

-- the capability-style lookups: you need the reference
SELECT t.eq(jsonb_array_length(public.get_order_status(ARRAY['QTR-NOPE'])), 0, 'unknown reference reveals nothing');
SELECT t.ok(public.get_public_order(NULL, 'QTR-NOPE') IS NULL, 'unknown reference reveals nothing (invoice lookup)');
SELECT t.ok(public.get_public_order(NULL, 'QTR-1-1-2027-SEC000000001') IS NOT NULL, 'the reference opens the invoice lookup');
SELECT t.ok(NOT (public.get_public_order(NULL, 'QTR-1-1-2027-SEC000000001') -> 'ticket_holders' -> 0 ? 'id_number'),
            'the public invoice lookup never returns national ID numbers');
RESET ROLE;

-- ===================== signed-in non-admin =================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', true);

SELECT t.eq(t.rows('SELECT 1 FROM public.customers'), 0::bigint, 'member sees no customers');
SELECT t.eq(t.rows('SELECT 1 FROM public.orders'), 0::bigint, 'member sees no orders');
SELECT t.eq(t.rows('SELECT 1 FROM public.ticket_holders'), 0::bigint, 'member sees no ticket holders');
SELECT t.eq(t.rows('SELECT sadad_secret FROM public.settings'), 0::bigint, 'member sees no gateway settings');
SELECT t.eq(t.rows('SELECT 1 FROM public.payment_events'), 0::bigint, 'member sees no payment events');
SELECT t.throws($$INSERT INTO public.orders (customer_id, event_id, ticket_type, quantity, total_amount, payment_method,
                               payment_status, booking_reference)
    VALUES ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'vip', 1, 200,
            'sadad', 'confirmed', 'QTR-FREE2')$$, '42501', 'member cannot mint a confirmed order');
SELECT t.throws($$SELECT public.create_pos_booking('{"name":"x","phone":"1"}'::jsonb, 'a0000000-0000-4000-8000-000000000001',
        0, 'POS-FREE', '[{"name":"x","phone":"1","ticket_type":"vip"}]'::jsonb, NULL)$$,
        '42501', 'member cannot book "POS" tickets for free');
SELECT t.eq(
  t.rows($$WITH u AS (UPDATE public.orders SET payment_status = 'cancelled' RETURNING 1) SELECT * FROM u$$),
  0::bigint, 'member cannot change orders');
SELECT t.throws($$SELECT public.cancel_order('e0000000-0000-4000-8000-000000000001')$$,
                'forbidden', 'member cannot cancel orders');
SELECT t.throws($$SELECT public.recount_ticket_stock()$$, 'forbidden', 'member cannot recount stock');
SELECT t.throws($$INSERT INTO storage.objects (bucket_id, name) VALUES ('qr-codes', 'member.png')$$,
                '42501', 'member cannot upload to the QR bucket');
RESET ROLE;

-- ===================== admin ===============================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);

SELECT t.eq(public.get_public_order(NULL, 'QTR-1-1-2027-SEC000000001') -> 'ticket_holders' -> 0 ->> 'id_number', '29850123456',
            'a signed-in administrator still gets the ID number (printed tickets show it)');
SELECT t.eq(t.rows('SELECT 1 FROM public.customers'), 1::bigint, 'admin sees customers');
SELECT t.eq(t.rows('SELECT 1 FROM public.orders'), 1::bigint, 'admin sees orders');
SELECT t.eq(t.rows('SELECT 1 FROM public.ticket_holders'), 1::bigint, 'admin sees ticket holders');
SELECT t.eq((SELECT sadad_secret FROM public.settings), 'topsecret', 'admin can read gateway secrets');
SELECT t.eq(
  t.rows($$WITH u AS (UPDATE public.settings SET site_url = 'https://example.qa' RETURNING 1) SELECT * FROM u$$),
  1::bigint, 'admin can edit gateway settings');
SELECT t.ok(t.rows($$WITH i AS (INSERT INTO storage.objects (bucket_id, name) VALUES ('qr-codes', 'admin.png') RETURNING 1) SELECT * FROM i$$) = 1,
            'admin can upload to the QR bucket');
SELECT t.ok((public.cancel_order('e0000000-0000-4000-8000-000000000001') ->> 'result') = 'cancelled', 'admin can cancel an order');
SELECT t.eq((SELECT payment_note FROM public.orders WHERE id = 'e0000000-0000-4000-8000-000000000001'), 'admin_cancelled',
            'and the order records why');
RESET ROLE;

-- ===================== service role ========================================
SET LOCAL ROLE service_role;
SELECT t.ok(t.rows('SELECT sadad_secret FROM public.settings') = 1, 'service role reads gateway settings');
SELECT t.ok(t.rows('SELECT 1 FROM public.orders') = 1, 'service role reads orders');
SELECT t.ok(public.create_order(t.customer(), t.items('{"b2000000-0000-4000-8000-000000000001":1}'),
                                t.holders('{"b2000000-0000-4000-8000-000000000001":1}'), 'sadad') IS NOT NULL,
            'service role can create orders');
RESET ROLE;

ROLLBACK;

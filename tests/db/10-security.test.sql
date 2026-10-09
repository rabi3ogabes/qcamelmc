-- Who can see and do what. Runs after ALL migrations (including the lockdown).
BEGIN;
SELECT t.seed();

INSERT INTO public.customers (id, name, email, phone, id_number)
VALUES ('d0000000-0000-4000-8000-000000000001', 'Real Person', 'real@example.com', '5551', '29850123456');
INSERT INTO public.orders (id, customer_id, event_id, ticket_type, quantity, total_amount,
                           payment_method, payment_status, booking_reference)
VALUES ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001', 'normal', 1, 100, 'sadad', 'confirmed', 'QTR-SEC000000001');
INSERT INTO public.ticket_holders (order_id, name, phone, nationality, ticket_type, qr_code, id_number)
VALUES ('e0000000-0000-4000-8000-000000000001', 'Real Person', '+974 5551', 'قطر', 'normal',
        'QTR-SEC000000001-TKT01', '29850123456');
UPDATE public.private_settings SET sadad_secret = 'topsecret', webhook_url = 'https://n8n.example/hook';

-- ===================== anonymous visitor ===================================
SET LOCAL ROLE anon;

SELECT t.throws('SELECT * FROM public.customers', '42501', 'anon cannot read customers');
SELECT t.throws('SELECT * FROM public.orders', '42501', 'anon cannot read orders');
SELECT t.throws('SELECT * FROM public.ticket_holders', '42501', 'anon cannot read ticket holders');
SELECT t.throws('SELECT * FROM public.private_settings', '42501', 'anon cannot read private settings');
SELECT t.throws('SELECT * FROM public.payment_events', '42501', 'anon cannot read payment events');

SELECT t.throws(
  $$INSERT INTO public.customers (name, email, phone) VALUES ('x', 'x@x.com', '1')$$,
  '42501', 'anon cannot insert customers');
SELECT t.throws(
  $$INSERT INTO public.orders (customer_id, event_id, ticket_type, quantity, total_amount, payment_method,
                               payment_status, booking_reference)
    VALUES ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'vip', 1, 0,
            'sadad', 'confirmed', 'QTR-FREE')$$,
  '42501', 'anon cannot mint a confirmed order');
SELECT t.throws(
  $$INSERT INTO public.ticket_holders (order_id, name, phone, nationality, ticket_type)
    VALUES ('e0000000-0000-4000-8000-000000000001', 'x', '1', 'x', 'vip')$$,
  '42501', 'anon cannot insert ticket holders');

-- what a visitor legitimately needs still works
SELECT t.eq(t.rows('SELECT 1 FROM public.events'), 2::bigint, 'anon sees only active events');
SELECT t.ok(t.rows('SELECT 1 FROM public.tickets') >= 4, 'anon can read ticket prices');
SELECT t.ok(t.rows('SELECT logo_url, header_bg_color, hero_text FROM public.settings') >= 0,
            'anon can read public branding settings');
SELECT t.eq(t.rows('SELECT 1 FROM public.admin_users'), 0::bigint, 'anon sees no admin accounts');

-- secrets are no longer part of the public settings table
SELECT t.throws('SELECT sadad_secret FROM public.settings', '42703', 'sadad_secret is not a public column');
SELECT t.throws('SELECT sadad_api_key FROM public.settings', '42703', 'sadad_api_key is not a public column');
SELECT t.throws('SELECT webhook_url FROM public.settings', '42703', 'webhook_url is not a public column');
SELECT t.throws('SELECT admin_phone FROM public.settings', '42703', 'admin_phone is not a public column');

-- privileged functions are not callable from the browser
SELECT t.throws($$SELECT public.create_order('{}'::jsonb, '[]'::jsonb, '[]'::jsonb, 'sadad')$$,
                '42501', 'anon cannot call create_order');
SELECT t.throws($$SELECT public.confirm_order_payment('QTR-X', 'SD1')$$, '42501', 'anon cannot confirm payments');
SELECT t.throws($$SELECT public.mark_order_payment_failed('QTR-X')$$, '42501', 'anon cannot fail payments');
SELECT t.throws($$SELECT public.check_in_ticket('QTR-X-TKT01', NULL)$$, '42501', 'anon cannot check tickets in');
SELECT t.throws($$SELECT public.expire_stale_orders()$$, '42501', 'anon cannot run expiry');

-- the safe, capability-style lookup is the only thing anon may call
SELECT t.ok(public.get_order_status(ARRAY['QTR-NOPE']) IS NOT NULL, 'anon may look up an order by its reference');
SELECT t.eq(jsonb_array_length(public.get_order_status(ARRAY['QTR-NOPE'])), 0, 'unknown reference reveals nothing');
RESET ROLE;

-- ===================== signed-in non-admin =================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', true);

SELECT t.eq(t.rows('SELECT 1 FROM public.customers'), 0::bigint, 'member sees no customers');
SELECT t.eq(t.rows('SELECT 1 FROM public.orders'), 0::bigint, 'member sees no orders');
SELECT t.eq(t.rows('SELECT 1 FROM public.ticket_holders'), 0::bigint, 'member sees no ticket holders');
SELECT t.eq(t.rows('SELECT 1 FROM public.private_settings'), 0::bigint, 'member sees no private settings');
SELECT t.eq(t.rows('SELECT 1 FROM public.payment_events'), 0::bigint, 'member sees no payment events');
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

SELECT t.eq(t.rows('SELECT 1 FROM public.customers'), 1::bigint, 'admin sees customers');
SELECT t.eq(t.rows('SELECT 1 FROM public.orders'), 1::bigint, 'admin sees orders');
SELECT t.eq(t.rows('SELECT 1 FROM public.ticket_holders'), 1::bigint, 'admin sees ticket holders');
SELECT t.eq((SELECT sadad_secret FROM public.private_settings), 'topsecret', 'admin can read gateway secrets');
SELECT t.eq(
  t.rows($$WITH u AS (UPDATE public.private_settings SET site_url = 'https://example.qa' RETURNING 1) SELECT * FROM u$$),
  1::bigint, 'admin can edit private settings');
SELECT t.ok(t.rows($$WITH i AS (INSERT INTO storage.objects (bucket_id, name) VALUES ('qr-codes', 'admin.png') RETURNING 1) SELECT * FROM i$$) = 1,
            'admin can upload to the QR bucket');
SELECT t.ok((public.cancel_order('e0000000-0000-4000-8000-000000000001') ->> 'result') = 'cancelled', 'admin can cancel an order');
RESET ROLE;

-- ===================== service role ========================================
SET LOCAL ROLE service_role;
SELECT t.ok(t.rows('SELECT 1 FROM public.private_settings') = 1, 'service role reads private settings');
SELECT t.ok(t.rows('SELECT 1 FROM public.orders') = 1, 'service role reads orders');
RESET ROLE;

ROLLBACK;

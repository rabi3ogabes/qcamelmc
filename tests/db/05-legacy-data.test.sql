-- The data migration must carry production data across without losing or
-- exposing anything. Runs against the legacy-shaped rows from 02-legacy-seed.sql.

-- gateway settings: nothing lost, new columns have safe defaults
SELECT t.eq((SELECT webhook_url FROM public.settings), 'https://n8n.example/webhook/live', 'webhook URL kept');
SELECT t.eq((SELECT sadad_secret FROM public.settings), 'secret-legacy', 'Sadad secret kept');
SELECT t.eq((SELECT sadad_merchant_id FROM public.settings), '1664851', 'merchant id kept');
SELECT t.eq((SELECT sadad_environment FROM public.settings), 'auto', 'environment defaults to auto');
SELECT t.ok((SELECT site_url IS NULL FROM public.settings), 'site url starts empty');
SELECT t.eq((SELECT logo_url FROM public.settings), 'https://example.qa/logo.png', 'public branding kept');

-- QR codes: the code and the image URL are now separate fields
SELECT t.eq((SELECT qr_code FROM public.ticket_holders WHERE name = 'A'), 'QTR-25-12-2026-L1AAAAAA-TKT01',
            'URL-style qr_code restored to its code');
SELECT t.eq((SELECT qr_image_url FROM public.ticket_holders WHERE name = 'A'),
            'https://abc.supabase.co/storage/v1/object/public/qr-codes/QTR-25-12-2026-L1AAAAAA-TKT01.png', 'image URL preserved');
SELECT t.eq((SELECT qr_code FROM public.ticket_holders WHERE name = 'B'), 'QTR-25-12-2026-L1AAAAAA-TKT02', 'second URL-style code restored');
SELECT t.eq((SELECT qr_code FROM public.ticket_holders WHERE name = 'C'), 'QTR-25-12-2026-L2BBBBBB-TKT01', 'plain codes untouched');
SELECT t.ok((SELECT qr_image_url IS NULL FROM public.ticket_holders WHERE name = 'C'), 'plain codes have no image yet');
SELECT t.eq((SELECT count(*) FROM public.ticket_holders WHERE qr_code ~* '^https?://'), 0::bigint, 'no qr_code holds a URL any more');

-- abandoned online checkouts are closed, a fresh one keeps its seat for the rest of its 30 minutes
SELECT t.eq((SELECT payment_status::text FROM public.orders WHERE booking_reference = 'QTR-25-12-2026-L2BBBBBB'), 'cancelled',
            'a 3-day-old unpaid online order is closed');
SELECT t.eq((SELECT payment_note FROM public.orders WHERE booking_reference = 'QTR-25-12-2026-L2BBBBBB'), 'expired',
            'and marked expired (so "verify with Sadad" can still rescue it)');
SELECT t.eq((SELECT payment_status::text FROM public.orders WHERE booking_reference = 'QTR-25-12-2026-L5EEEEEE'), 'pending',
            'a 5-minute-old online checkout is still open');
SELECT t.ok((SELECT payment_expires_at BETWEEN now() + interval '24 minutes' AND now() + interval '26 minutes'
               FROM public.orders WHERE booking_reference = 'QTR-25-12-2026-L5EEEEEE'),
            'it expires 30 minutes after it was created');
SELECT t.eq((SELECT payment_status::text FROM public.orders WHERE booking_reference = 'QTR-25-12-2026-L1AAAAAA'), 'confirmed',
            'confirmed orders are untouched');
SELECT t.eq((SELECT payment_status::text FROM public.orders WHERE booking_reference = 'QTR-25-12-2026-L3CCCCCC'), 'cancelled',
            'cancelled orders are untouched');

-- stock recount: confirmed + live pending count; cancelled and expired do not
SELECT t.eq((SELECT sold_quantity FROM public.tickets WHERE id = 'f2000000-0000-4000-8000-000000000001'), 3,
            'normal: 2 (confirmed online) + 1 (POS) = 3 (cancelled excluded)');
SELECT t.eq((SELECT sold_quantity FROM public.tickets WHERE id = 'f1000000-0000-4000-8000-000000000001'), 1,
            'vip: only the fresh pending checkout holds a seat (the abandoned one released it)');
SELECT t.eq((SELECT sold_quantity FROM public.tickets WHERE id = 'f3000000-0000-4000-8000-000000000001'), 0,
            'parking: stale drift corrected to what is really held');

-- the earlier counters were replaced, not left to fight the new ones
SELECT t.eq((SELECT count(*) FROM pg_trigger WHERE tgname IN
              ('trigger_update_ticket_sold_on_order_confirm', 'trigger_update_ticket_sold_on_order_delete',
               'trigger_update_ticket_sold_on_holder_change', 'trigger_enforce_ticket_capacity')),
            0::bigint, 'old stock counters are gone');
SELECT t.ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_enforce_ticket_limit'),
            'the 5-tickets-per-person rule is kept');

-- a Sadad transaction can settle only one order
SELECT t.ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orders_payment_id_key'),
            'a Sadad transaction can only be applied to one order');

-- leave the database empty for the remaining tests
TRUNCATE public.events, public.customers CASCADE;

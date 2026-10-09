-- The data migration must carry production data across without losing or
-- exposing anything. Runs against the legacy-shaped rows from 02-legacy-seed.sql.

-- secrets moved to the admin-only table, nothing lost
SELECT t.eq((SELECT webhook_url FROM public.private_settings), 'https://n8n.example/webhook/edited', 'a webhook edited in the old screen during the rollout is not lost');
SELECT t.eq((SELECT admin_phone FROM public.private_settings), '+97455500000', 'admin phone copied');
SELECT t.eq((SELECT sadad_merchant_id FROM public.private_settings), '1664851', 'merchant id copied');
SELECT t.eq((SELECT sadad_api_key FROM public.private_settings), 'apikey-legacy', 'api key copied');
SELECT t.eq((SELECT sadad_secret FROM public.private_settings), 'secret-edited-in-old-ui', 'a secret edited in the old screen during the rollout is not lost');
SELECT t.eq((SELECT sadad_merchant_id FROM public.private_settings), '1664851', 'untouched values stay');
SELECT t.eq((SELECT sadad_website_domain FROM public.private_settings), 'qcamelmc.org',
            'missing website domain keeps the previous built-in default');
SELECT t.eq((SELECT sadad_environment FROM public.private_settings), 'auto', 'environment defaults to auto');
SELECT t.eq((SELECT count(*) FROM public.private_settings), 1::bigint, 'exactly one private settings row');

-- public branding survived, secrets are gone from the public table
SELECT t.eq((SELECT logo_url FROM public.settings LIMIT 1), 'https://example.qa/logo.png', 'public logo kept');
SELECT t.eq(
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settings'
      AND column_name IN ('sadad_secret', 'sadad_api_key', 'sadad_merchant_id', 'sadad_website_domain', 'webhook_url', 'admin_phone')),
  0::bigint, 'no secret columns remain on public.settings');

-- QR codes: the code and the image URL are now separate fields
SELECT t.eq((SELECT qr_code FROM public.ticket_holders WHERE name = 'A'), 'QTR-L1AAAAAA-TKT01', 'URL-style qr_code restored to its code');
SELECT t.eq((SELECT qr_image_url FROM public.ticket_holders WHERE name = 'A'),
            'https://abc.supabase.co/storage/v1/object/public/qr-codes/QTR-L1AAAAAA-TKT01.png', 'image URL preserved');
SELECT t.eq((SELECT qr_code FROM public.ticket_holders WHERE name = 'B'), 'QTR-L1AAAAAA-TKT02', 'second URL-style code restored');
SELECT t.eq((SELECT qr_code FROM public.ticket_holders WHERE name = 'C'), 'QTR-L2BBBBBB-TKT01', 'plain codes untouched');
SELECT t.ok((SELECT qr_image_url IS NULL FROM public.ticket_holders WHERE name = 'C'), 'plain codes have no image yet');
SELECT t.eq((SELECT count(*) FROM public.ticket_holders WHERE qr_code ~* '^https?://'), 0::bigint, 'no qr_code holds a URL any more');

-- stock recount: confirmed + pending count, cancelled does not; orders without holders fall back to quantity
SELECT t.eq((SELECT sold_quantity FROM public.tickets WHERE id = 'f2000000-0000-4000-8000-000000000001'), 3,
            'normal: 2 (confirmed online) + 1 (POS) = 3 (cancelled excluded)');
SELECT t.eq((SELECT sold_quantity FROM public.tickets WHERE id = 'f1000000-0000-4000-8000-000000000001'), 1,
            'vip: legacy pending online order still holds its seat');
SELECT t.eq((SELECT sold_quantity FROM public.tickets WHERE id = 'f3000000-0000-4000-8000-000000000001'), 2,
            'parking: order without holders counted by quantity');

-- legacy pending online orders are never auto-expired (they may have been paid)
SELECT t.ok((SELECT payment_expires_at IS NULL FROM public.orders WHERE booking_reference = 'QTR-L2BBBBBB'),
            'legacy pending order has no expiry');
SET LOCAL ROLE service_role;
SELECT public.expire_stale_orders();
RESET ROLE;
SELECT t.eq((SELECT payment_status::text FROM public.orders WHERE booking_reference = 'QTR-L2BBBBBB'), 'pending',
            'expiry job leaves legacy pending orders alone');

-- the unique transaction index exists
SELECT t.ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'orders_payment_id_key'),
            'a Sadad transaction can only be applied to one order');

-- leave the database empty for the remaining tests
TRUNCATE public.events, public.customers CASCADE;

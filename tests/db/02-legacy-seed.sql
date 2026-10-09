-- Data shaped like the PRODUCTION database before this hardening (main as of
-- October 2026). Applied after the existing migrations and before the new ones,
-- so the data migration is proven on realistic rows:
--  * the old counter only counted CONFIRMED holders, so abandoned online
--    checkouts were never released and the counters drifted
--  * ticket_holders.qr_code sometimes holds the QR *image URL* instead of the code
--  * old pending online orders may or may not have been paid
--  * gateway secrets sit in the (admin-only) settings table

UPDATE public.settings
   SET logo_url = 'https://example.qa/logo.png',
       webhook_url = 'https://n8n.example/webhook/live',
       admin_phone = '+97455500000',
       sadad_merchant_id = '1664851',
       sadad_api_key = 'pin-legacy',
       sadad_secret = 'secret-legacy',
       sadad_website_domain = NULL;

INSERT INTO public.events (id, title, event_date, location, is_active)
VALUES ('f0000000-0000-4000-8000-000000000001', 'Legacy Event', '2026-12-25 18:00:00+03', 'Doha', true);

INSERT INTO public.tickets (id, event_id, type, price, available_quantity, sold_quantity) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'vip', 200, 10, 0),
  ('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'normal', 100, 10, 0),
  ('f3000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'parking', 10, 10, 0);

INSERT INTO public.customers (id, name, email, phone)
VALUES ('f9000000-0000-4000-8000-000000000001', 'Legacy Customer', 'legacy@example.com', '55500000');

-- confirmed online (2 normal), abandoned online checkout from 3 days ago (1 vip),
-- online checkout started 5 minutes ago (1 vip), cancelled cash (1 normal),
-- confirmed POS (1 normal)
INSERT INTO public.orders (id, customer_id, event_id, ticket_type, quantity, total_amount,
                           payment_method, payment_status, booking_reference, created_at) VALUES
  ('fa000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'normal', 2, 200, 'sadad', 'confirmed', 'QTR-25-12-2026-L1AAAAAA', now() - interval '2 days'),
  ('fa000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'vip', 1, 200, 'sadad', 'pending', 'QTR-25-12-2026-L2BBBBBB', now() - interval '3 days'),
  ('fa000000-0000-4000-8000-000000000003', 'f9000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'normal', 1, 100, 'cash_pos', 'cancelled', 'QTR-25-12-2026-L3CCCCCC', now() - interval '1 day'),
  ('fa000000-0000-4000-8000-000000000004', 'f9000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'normal', 1, 100, 'cash_pos', 'confirmed', 'POS-25-12-2026-L4DDDDDD', now() - interval '1 day'),
  ('fa000000-0000-4000-8000-000000000005', 'f9000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'vip', 1, 200, 'sadad', 'pending', 'QTR-25-12-2026-L5EEEEEE', now() - interval '5 minutes');

INSERT INTO public.ticket_holders (order_id, name, phone, nationality, ticket_type, qr_code, id_number) VALUES
  ('fa000000-0000-4000-8000-000000000001', 'A', '55500001', 'x', 'normal',
   'https://abc.supabase.co/storage/v1/object/public/qr-codes/QTR-25-12-2026-L1AAAAAA-TKT01.png', '290000000001'),
  ('fa000000-0000-4000-8000-000000000001', 'B', '55500002', 'x', 'normal',
   'https://abc.supabase.co/storage/v1/object/public/qr-codes/QTR-25-12-2026-L1AAAAAA-TKT02.png', '290000000002'),
  ('fa000000-0000-4000-8000-000000000002', 'C', '55500003', 'x', 'vip', 'QTR-25-12-2026-L2BBBBBB-TKT01', '290000000003'),
  ('fa000000-0000-4000-8000-000000000003', 'D', '55500004', 'x', 'normal', 'QTR-25-12-2026-L3CCCCCC-TKT01', '290000000004'),
  ('fa000000-0000-4000-8000-000000000004', 'E', '55500005', 'x', 'normal', 'POS-25-12-2026-L4DDDDDD-TKT01', '290000000005'),
  ('fa000000-0000-4000-8000-000000000005', 'F', '55500006', 'x', 'vip', 'QTR-25-12-2026-L5EEEEEE-TKT01', '290000000006');

-- the counters had drifted in production: make them visibly wrong
UPDATE public.tickets SET sold_quantity = 7 WHERE id = 'f2000000-0000-4000-8000-000000000001';
UPDATE public.tickets SET sold_quantity = 5 WHERE id = 'f3000000-0000-4000-8000-000000000001';

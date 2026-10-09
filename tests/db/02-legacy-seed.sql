-- Data shaped exactly like the PRODUCTION database before this hardening:
--  * gateway secrets live in the public settings table
--  * online orders never touched sold_quantity (only POS did)
--  * ticket_holders.qr_code sometimes holds the QR *image URL* instead of the code
--  * old pending online orders may or may not have been paid (confirmation was broken)
-- Applied after the legacy migrations and before the new ones.

UPDATE public.settings
   SET logo_url = 'https://example.qa/logo.png',
       webhook_url = 'https://n8n.example/webhook/live',
       admin_phone = '+97455500000',
       sadad_merchant_id = '1664851',
       sadad_api_key = 'apikey-legacy',
       sadad_secret = 'secret-legacy',
       sadad_website_domain = NULL;

INSERT INTO public.events (id, title, event_date, location, is_active)
VALUES ('f0000000-0000-4000-8000-000000000001', 'Legacy Event', now() + interval '10 days', 'Doha', true);

INSERT INTO public.tickets (id, event_id, type, price, available_quantity, sold_quantity) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'vip', 200, 10, 0),
  ('f2000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'normal', 100, 10, 7),
  ('f3000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'parking', 10, 10, 5);

INSERT INTO public.customers (id, name, email, phone)
VALUES ('f9000000-0000-4000-8000-000000000001', 'Legacy Customer', 'legacy@example.com', '55500000');

INSERT INTO public.orders (id, customer_id, event_id, ticket_type, quantity, total_amount,
                           payment_method, payment_status, booking_reference) VALUES
  ('fa000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'normal', 2, 200, 'sadad', 'confirmed', 'QTR-L1AAAAAA'),
  ('fa000000-0000-4000-8000-000000000002', 'f9000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'vip', 1, 200, 'sadad', 'pending', 'QTR-L2BBBBBB'),
  ('fa000000-0000-4000-8000-000000000003', 'f9000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'normal', 1, 100, 'cash_pos', 'cancelled', 'QTR-L3CCCCCC'),
  ('fa000000-0000-4000-8000-000000000004', 'f9000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'normal', 1, 100, 'cash_pos', 'confirmed', 'POS-L4DDDDDD'),
  ('fa000000-0000-4000-8000-000000000005', 'f9000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'parking', 2, 20, 'sadad', 'confirmed', 'QTR-L5EEEEEE');

INSERT INTO public.ticket_holders (order_id, name, phone, nationality, ticket_type, qr_code, id_number) VALUES
  ('fa000000-0000-4000-8000-000000000001', 'A', '+974 1', 'x', 'normal',
   'https://abc.supabase.co/storage/v1/object/public/qr-codes/QTR-L1AAAAAA-TKT01.png', '1'),
  ('fa000000-0000-4000-8000-000000000001', 'B', '+974 2', 'x', 'normal',
   'https://abc.supabase.co/storage/v1/object/public/qr-codes/QTR-L1AAAAAA-TKT02.png', '2'),
  ('fa000000-0000-4000-8000-000000000002', 'C', '+974 3', 'x', 'vip', 'QTR-L2BBBBBB-TKT01', '3'),
  ('fa000000-0000-4000-8000-000000000003', 'D', '+974 4', 'x', 'normal', 'QTR-L3CCCCCC-TKT01', '4'),
  ('fa000000-0000-4000-8000-000000000004', 'E', '+974 5', 'x', 'normal', 'POS-L4DDDDDD-TKT01', '5');

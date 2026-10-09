-- =============================================================================
-- LOCKDOWN — removes the open access that exposed customer data, secrets and
-- order creation to every visitor.
--
-- Apply AFTER the new frontend and edge functions are live: the previous site
-- reads and writes these tables directly and will stop working once this runs.
-- =============================================================================

-- Refuse to run before the secrets were copied to their new home.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.private_settings) THEN
    RAISE EXCEPTION 'private_settings is empty: apply 20261009100100_orders_payments_additive.sql first';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Secrets leave the world-readable settings table
-- -----------------------------------------------------------------------------

-- The previous admin screen is still live during a rollout. If it was used to change
-- gateway settings AFTER the first copy was made, carry that edit over: whichever
-- side was edited most recently wins, so nothing an admin typed is lost.
UPDATE public.private_settings p
   SET webhook_url = s.webhook_url,
       admin_phone = s.admin_phone,
       sadad_merchant_id = s.sadad_merchant_id,
       sadad_api_key = s.sadad_api_key,
       sadad_secret = s.sadad_secret,
       sadad_website_domain = COALESCE(NULLIF(btrim(s.sadad_website_domain), ''), p.sadad_website_domain)
  FROM (SELECT * FROM public.settings ORDER BY created_at LIMIT 1) s
 WHERE s.updated_at > p.updated_at;

ALTER TABLE public.settings
  DROP COLUMN IF EXISTS webhook_url,
  DROP COLUMN IF EXISTS admin_phone,
  DROP COLUMN IF EXISTS sadad_merchant_id,
  DROP COLUMN IF EXISTS sadad_api_key,
  DROP COLUMN IF EXISTS sadad_secret,
  DROP COLUMN IF EXISTS sadad_website_domain;

-- -----------------------------------------------------------------------------
-- 2. Customer / order / ticket-holder data is admin-only
--    (customers had FORCE ROW LEVEL SECURITY, which also binds the table owner
--    and would block the SECURITY DEFINER order functions.)
-- -----------------------------------------------------------------------------
ALTER TABLE public.customers NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_public_select_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
DROP POLICY IF EXISTS "Anyone can create customer records" ON public.customers;
DROP POLICY IF EXISTS "Allow all users to create customer records" ON public.customers;
DROP POLICY IF EXISTS "Admins can view all customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can view customers" ON public.customers;
CREATE POLICY "Admins can view customers" ON public.customers
  FOR SELECT TO authenticated USING (public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
DROP POLICY IF EXISTS "Customers can view their own orders" ON public.orders;

DROP POLICY IF EXISTS "Anyone can create ticket holders" ON public.ticket_holders;
DROP POLICY IF EXISTS "Customers can view their ticket holders" ON public.ticket_holders;
DROP POLICY IF EXISTS "Public can view ticket holders" ON public.ticket_holders;

-- Defence in depth: even a future permissive policy cannot expose these to
-- visitors, and the browser can no longer insert orders by any route.
REVOKE ALL ON public.customers, public.orders, public.ticket_holders FROM anon;
REVOKE INSERT ON public.customers, public.orders, public.ticket_holders FROM authenticated;

-- -----------------------------------------------------------------------------
-- 3. QR image bucket: only admins (or the service role) may write
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users to upload QR codes" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update QR codes" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update QR codes" ON storage.objects;
CREATE POLICY "Admins can update QR codes" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'qr-codes' AND public.is_admin((SELECT auth.uid())))
  WITH CHECK (bucket_id = 'qr-codes' AND public.is_admin((SELECT auth.uid())));

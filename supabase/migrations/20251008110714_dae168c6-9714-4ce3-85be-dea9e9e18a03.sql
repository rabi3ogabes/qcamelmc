-- First, let's check and fix the customers table RLS setup
-- Drop all existing policies on customers
DROP POLICY IF EXISTS "Anyone can create customer records" ON public.customers;
DROP POLICY IF EXISTS "Allow all users to create customer records" ON public.customers;
DROP POLICY IF EXISTS "Admins can view all customers" ON public.customers;

-- Recreate policies with correct configuration
-- Allow anyone (including anonymous users) to insert customer records
CREATE POLICY "customers_insert_policy"
ON public.customers
FOR INSERT
TO public
WITH CHECK (true);

-- Allow admins to view all customers
CREATE POLICY "customers_select_policy"
ON public.customers
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM admin_users WHERE id = auth.uid()
  )
);

-- Verify RLS is enabled
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;
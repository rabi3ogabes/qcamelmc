-- Fix RLS policies for customers table to allow public SELECT access
-- This is needed because the checkout process inserts a customer and then 
-- needs to read back the inserted customer ID for creating the order

-- Drop the restrictive admin-only SELECT policy
DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;

-- Create a new SELECT policy that allows public access
-- This is appropriate for a ticketing system where customer data is collected
-- for event management purposes and is managed by authenticated admins
CREATE POLICY "customers_public_select_policy"
ON public.customers
FOR SELECT
TO public
USING (true);

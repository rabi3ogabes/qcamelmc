-- Fix customers table RLS policy to allow both authenticated and anonymous users to create records
DROP POLICY IF EXISTS "Anyone can create customer records" ON public.customers;

CREATE POLICY "Allow all users to create customer records" 
ON public.customers 
FOR INSERT 
TO public
WITH CHECK (true);
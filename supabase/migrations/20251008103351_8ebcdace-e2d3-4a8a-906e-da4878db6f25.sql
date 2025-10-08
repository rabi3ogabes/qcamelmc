-- Drop the incorrect policy
DROP POLICY IF EXISTS "Allow all users to create customer records" ON public.customers;

-- Create correct policy for anonymous users (customers booking tickets)
CREATE POLICY "Anyone can create customer records" 
ON public.customers 
FOR INSERT 
TO anon, authenticated
WITH CHECK (true);
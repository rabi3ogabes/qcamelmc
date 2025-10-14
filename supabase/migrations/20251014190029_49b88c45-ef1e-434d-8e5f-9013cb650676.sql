-- Allow viewing ticket holders for orders that the user can see
-- This matches the orders RLS policy
DROP POLICY IF EXISTS "Admins can view all ticket holders" ON ticket_holders;
DROP POLICY IF EXISTS "Customers can view their ticket holders" ON ticket_holders;

-- Admins can view all ticket holders
CREATE POLICY "Admins can view all ticket holders" 
ON ticket_holders 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.id = auth.uid()
  )
);

-- Customers can view ticket holders for their own orders
CREATE POLICY "Customers can view their ticket holders" 
ON ticket_holders 
FOR SELECT 
USING (
  order_id IN (
    SELECT orders.id 
    FROM orders 
    WHERE orders.customer_id IN (
      SELECT customers.id 
      FROM customers
    )
  )
);

-- Allow public read access for ticket holders (needed for live bookings page)
CREATE POLICY "Public can view ticket holders" 
ON ticket_holders 
FOR SELECT 
USING (true);
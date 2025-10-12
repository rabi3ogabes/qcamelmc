-- Allow admins to delete customers
CREATE POLICY "Admins can delete customers"
ON public.customers
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM admin_users
    WHERE admin_users.id = auth.uid()
  )
);
-- Allow admins to update ticket holders (needed for check-in)
CREATE POLICY "Admins can update ticket holders"
ON public.ticket_holders
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM admin_users
    WHERE admin_users.id = auth.uid()
  )
);
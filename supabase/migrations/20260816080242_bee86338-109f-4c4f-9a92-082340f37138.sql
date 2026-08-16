GRANT SELECT ON public.customers TO authenticated;
CREATE POLICY "Admins can view customers" ON public.customers FOR SELECT TO authenticated USING (is_admin(auth.uid()));
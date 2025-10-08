-- Grant INSERT permission to anon and authenticated roles on customers table
GRANT INSERT ON public.customers TO anon;
GRANT INSERT ON public.customers TO authenticated;

-- Also grant INSERT on ticket_holders and orders tables for the checkout flow
GRANT INSERT ON public.orders TO anon;
GRANT INSERT ON public.orders TO authenticated;
GRANT INSERT ON public.ticket_holders TO anon;
GRANT INSERT ON public.ticket_holders TO authenticated;
-- Public write tables (guest checkout / POS)
GRANT INSERT ON public.customers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

GRANT INSERT ON public.orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

GRANT INSERT ON public.ticket_holders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_holders TO authenticated;
GRANT ALL ON public.ticket_holders TO service_role;

-- Public read tables
GRANT SELECT ON public.events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;

GRANT SELECT ON public.tickets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;

GRANT SELECT ON public.settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;

GRANT SELECT ON public.pos_users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_users TO authenticated;
GRANT ALL ON public.pos_users TO service_role;

GRANT SELECT ON public.popup_banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.popup_banners TO authenticated;
GRANT ALL ON public.popup_banners TO service_role;

-- Analytics / logging (public insert, admin read)
GRANT INSERT ON public.activity_logs TO anon;
GRANT SELECT, INSERT, DELETE ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;

GRANT INSERT ON public.page_views TO anon;
GRANT SELECT, INSERT ON public.page_views TO authenticated;
GRANT ALL ON public.page_views TO service_role;

GRANT INSERT, UPDATE, DELETE ON public.active_visitors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_visitors TO authenticated;
GRANT ALL ON public.active_visitors TO service_role;

-- Staff / admin only tables
GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT ON public.email_delivery_events TO authenticated;
GRANT ALL ON public.email_delivery_events TO service_role;

GRANT SELECT ON public.expired_qr_codes TO authenticated;
GRANT ALL ON public.expired_qr_codes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_receipts TO authenticated;
GRANT ALL ON public.pos_receipts TO service_role;
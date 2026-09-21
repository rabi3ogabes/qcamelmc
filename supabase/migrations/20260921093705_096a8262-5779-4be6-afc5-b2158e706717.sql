GRANT INSERT, UPDATE, DELETE ON public.active_visitors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_visitors TO authenticated;
GRANT ALL ON public.active_visitors TO service_role;

GRANT INSERT ON public.page_views TO anon;
GRANT SELECT, INSERT ON public.page_views TO authenticated;
GRANT ALL ON public.page_views TO service_role;
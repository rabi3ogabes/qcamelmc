ALTER VIEW public.public_settings SET (security_invoker = on);

GRANT SELECT (clarity_project_id, clarity_enabled) ON public.settings TO anon, authenticated;
CREATE POLICY "Public can read branding settings"
ON public.settings
FOR SELECT
TO anon, authenticated
USING (true);

REVOKE SELECT ON public.settings FROM anon;
GRANT SELECT (id, logo_url, hero_image_url, before_footer_image_url, header_bg_color, header_bg_image_url, hero_text, copyright_text, admin_phone, current_event_id)
ON public.settings TO anon;
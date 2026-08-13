DROP VIEW IF EXISTS public.public_settings;

CREATE VIEW public.public_settings
WITH (security_invoker = off) AS
SELECT
  id,
  logo_url,
  header_bg_color,
  header_bg_image_url,
  hero_image_url,
  hero_text,
  before_footer_image_url,
  copyright_text,
  admin_phone,
  current_event_id,
  show_delete_customer_button,
  show_generate_qr_button,
  show_delete_event_button
FROM public.settings;

GRANT SELECT ON public.public_settings TO anon, authenticated;
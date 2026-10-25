ALTER TABLE public.settings
  ADD COLUMN hero_image_position text NOT NULL DEFAULT 'center' CHECK (hero_image_position IN ('top', 'center', 'bottom')),
  ADD COLUMN hero_image_height integer NOT NULL DEFAULT 600 CHECK (hero_image_height BETWEEN 300 AND 800);
CREATE OR REPLACE VIEW public.public_settings WITH (security_invoker = false) AS
 SELECT id, logo_url, header_bg_color, header_bg_image_url, hero_image_url, hero_text,
 before_footer_image_url, copyright_text, admin_phone, current_event_id,
 show_delete_customer_button, show_generate_qr_button, show_delete_event_button,
 clarity_project_id, clarity_enabled, before_footer_image_repeat, before_footer_image_opacity,
 hero_image_position, hero_image_height
 FROM public.settings;
GRANT SELECT ON public.public_settings TO anon, authenticated;
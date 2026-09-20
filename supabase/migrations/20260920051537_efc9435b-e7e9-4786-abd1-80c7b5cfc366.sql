-- 1) settings: no direct public/authenticated reads on the raw table
DROP POLICY IF EXISTS "Public can read branding settings" ON public.settings;
REVOKE SELECT ON public.settings FROM anon;
REVOKE SELECT (id, logo_url, header_bg_color, header_bg_image_url, hero_image_url, hero_text,
  before_footer_image_url, copyright_text, admin_phone, current_event_id,
  show_delete_customer_button, show_generate_qr_button, show_delete_event_button,
  clarity_project_id, clarity_enabled) ON public.settings FROM anon;
REVOKE SELECT (clarity_project_id, clarity_enabled) ON public.settings FROM authenticated;

-- public_settings becomes a definer view exposing only safe columns
ALTER VIEW public.public_settings SET (security_invoker = off);
GRANT SELECT ON public.public_settings TO anon, authenticated;

-- 2) staff_attendance: admins only (edge function uses service role)
DROP POLICY IF EXISTS "Staff can view attendance" ON public.staff_attendance;
DROP POLICY IF EXISTS "Staff can insert attendance" ON public.staff_attendance;
DROP POLICY IF EXISTS "Staff can update attendance" ON public.staff_attendance;
DROP POLICY IF EXISTS "Staff can delete attendance" ON public.staff_attendance;

CREATE POLICY "Admins can view attendance" ON public.staff_attendance
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert attendance" ON public.staff_attendance
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update attendance" ON public.staff_attendance
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete attendance" ON public.staff_attendance
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- 3) qr-codes bucket: writes restricted to admins
DROP POLICY IF EXISTS "Allow authenticated users to upload QR codes" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update QR codes" ON storage.objects;

CREATE POLICY "Admins can update QR codes" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'qr-codes' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'qr-codes' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete QR codes" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'qr-codes' AND public.is_admin(auth.uid()));

-- 4) SECURITY DEFINER functions: remove blanket PUBLIC execute, and anon execute where not needed
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_public_order(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_event_ticket_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_person_ticket_count(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_person_event_history(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_tickets(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_public_booking(jsonb, uuid, public.payment_method, numeric, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_pos_booking(jsonb, uuid, numeric, text, jsonb, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_order(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_event_ticket_counts(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_person_ticket_count(text, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_person_event_history(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_tickets(uuid, text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_public_booking(jsonb, uuid, public.payment_method, numeric, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_pos_booking(jsonb, uuid, numeric, text, jsonb, uuid) TO anon, authenticated, service_role;
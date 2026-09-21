CREATE TABLE public.deleted_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_id uuid NOT NULL,
  order_id uuid NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  nationality text NOT NULL,
  ticket_type text NOT NULL,
  qr_code text,
  is_present boolean,
  confirmed_at timestamptz,
  confirmed_by uuid,
  confirmed_by_name text,
  id_number text,
  country_code text,
  holder_created_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid,
  deleted_by_name text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deleted_tickets TO authenticated;
GRANT ALL ON public.deleted_tickets TO service_role;

ALTER TABLE public.deleted_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view deleted tickets"
  ON public.deleted_tickets FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can purge deleted tickets"
  ON public.deleted_tickets FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX idx_deleted_tickets_deleted_at ON public.deleted_tickets (deleted_at DESC);

CREATE OR REPLACE FUNCTION public.bin_ticket_holder(p_holder_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_holder public.ticket_holders%ROWTYPE;
  v_ctx jsonb;
  v_email text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'message', 'هذه العملية متاحة للأدمن فقط');
  END IF;

  SELECT * INTO v_holder FROM public.ticket_holders WHERE id = p_holder_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'التذكرة غير موجودة');
  END IF;

  SELECT jsonb_build_object(
           'booking_reference', o.booking_reference,
           'payment_status', o.payment_status,
           'payment_method', o.payment_method,
           'event_title', e.title,
           'event_date', e.event_date,
           'customer_name', c.name
         )
    INTO v_ctx
    FROM public.orders o
    LEFT JOIN public.events e ON e.id = o.event_id
    LEFT JOIN public.customers c ON c.id = o.customer_id
   WHERE o.id = v_holder.order_id;

  SELECT email INTO v_email FROM public.admin_users WHERE id = auth.uid();

  INSERT INTO public.deleted_tickets (
    holder_id, order_id, name, phone, nationality, ticket_type, qr_code,
    is_present, confirmed_at, confirmed_by, confirmed_by_name, id_number,
    country_code, holder_created_at, context, deleted_by, deleted_by_name
  ) VALUES (
    v_holder.id, v_holder.order_id, v_holder.name, v_holder.phone, v_holder.nationality,
    v_holder.ticket_type, v_holder.qr_code, v_holder.is_present, v_holder.confirmed_at,
    v_holder.confirmed_by, v_holder.confirmed_by_name, v_holder.id_number,
    v_holder.country_code, v_holder.created_at, COALESCE(v_ctx, '{}'::jsonb), auth.uid(), v_email
  );

  DELETE FROM public.ticket_holders WHERE id = p_holder_id;

  RETURN jsonb_build_object('success', true, 'message', 'تم نقل التذكرة إلى سلة المحذوفات');
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_ticket_holder(p_bin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.deleted_tickets%ROWTYPE;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'message', 'هذه العملية متاحة للأدمن فقط');
  END IF;

  SELECT * INTO v_row FROM public.deleted_tickets WHERE id = p_bin_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'العنصر غير موجود في السلة');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = v_row.order_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'تعذر الاسترجاع — الحجز الأصلي لم يعد موجوداً');
  END IF;

  INSERT INTO public.ticket_holders (
    id, order_id, name, phone, nationality, ticket_type, qr_code, is_present,
    confirmed_at, confirmed_by, confirmed_by_name, id_number, country_code, created_at
  ) VALUES (
    v_row.holder_id, v_row.order_id, v_row.name, v_row.phone, v_row.nationality,
    v_row.ticket_type, v_row.qr_code, v_row.is_present, v_row.confirmed_at,
    v_row.confirmed_by, v_row.confirmed_by_name, v_row.id_number, v_row.country_code,
    COALESCE(v_row.holder_created_at, now())
  );

  DELETE FROM public.deleted_tickets WHERE id = p_bin_id;

  RETURN jsonb_build_object('success', true, 'message', 'تم استرجاع التذكرة');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bin_ticket_holder(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_ticket_holder(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bin_ticket_holder(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_ticket_holder(uuid) TO authenticated;
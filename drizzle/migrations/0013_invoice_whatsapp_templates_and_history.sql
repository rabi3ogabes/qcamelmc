ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS whatsapp_templates jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.email_delivery_events ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';
ALTER TABLE public.email_delivery_events ADD COLUMN IF NOT EXISTS message_body text;
ALTER TABLE public.email_delivery_events ADD COLUMN IF NOT EXISTS template_name text;
ALTER TABLE public.email_delivery_events ADD COLUMN IF NOT EXISTS delivery_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_delivery_id_unique ON public.email_delivery_events(delivery_id) WHERE delivery_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_delivery_order_channel ON public.email_delivery_events(order_id, channel, created_at);
CREATE OR REPLACE FUNCTION public.validate_whatsapp_templates() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE item jsonb;
BEGIN
 IF jsonb_typeof(NEW.whatsapp_templates) <> 'array' OR jsonb_array_length(NEW.whatsapp_templates) > 50 THEN RAISE EXCEPTION 'Maximum 50 WhatsApp templates'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(NEW.whatsapp_templates) LOOP
  IF jsonb_typeof(item) <> 'object' OR coalesce(length(item->>'id'),0) NOT BETWEEN 1 AND 100 OR coalesce(length(trim(item->>'name')),0) NOT BETWEEN 1 AND 100 OR coalesce(length(trim(item->>'body')),0) NOT BETWEEN 1 AND 4000 OR jsonb_typeof(item->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid WhatsApp template'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER settings_validate_whatsapp_templates BEFORE INSERT OR UPDATE OF whatsapp_templates ON public.settings FOR EACH ROW EXECUTE FUNCTION public.validate_whatsapp_templates();
COMMENT ON COLUMN public.email_delivery_events.channel IS 'Independent invoice delivery channel: email or whatsapp; webhook acceptance is queued, not sent.';
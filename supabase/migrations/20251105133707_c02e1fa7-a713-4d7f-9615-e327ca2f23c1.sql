-- Create table to track expired QR codes
CREATE TABLE IF NOT EXISTS public.expired_qr_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  qr_code TEXT NOT NULL,
  order_id UUID NOT NULL,
  expired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reason TEXT NOT NULL DEFAULT 'event_date_changed',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.expired_qr_codes ENABLE ROW LEVEL SECURITY;

-- Admins can view expired QR codes
CREATE POLICY "Admins can view expired QR codes"
ON public.expired_qr_codes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admin_users
    WHERE admin_users.id = auth.uid()
  )
);

-- Anyone can check if QR code is expired (needed for check-in validation)
CREATE POLICY "Public can check expired QR codes"
ON public.expired_qr_codes
FOR SELECT
USING (true);

-- Create index for fast QR code lookup
CREATE INDEX IF NOT EXISTS idx_expired_qr_codes_qr_code ON public.expired_qr_codes(qr_code);
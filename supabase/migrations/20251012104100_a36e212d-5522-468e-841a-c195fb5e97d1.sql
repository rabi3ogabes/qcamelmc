-- Add qr_code column to ticket_holders table
ALTER TABLE public.ticket_holders
ADD COLUMN qr_code TEXT UNIQUE;

-- Add index for faster QR code lookups
CREATE INDEX idx_ticket_holders_qr_code ON public.ticket_holders(qr_code);

-- Create function to generate unique ticket holder reference
CREATE OR REPLACE FUNCTION public.generate_ticket_holder_reference()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN 'TKT-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 10));
END;
$$;
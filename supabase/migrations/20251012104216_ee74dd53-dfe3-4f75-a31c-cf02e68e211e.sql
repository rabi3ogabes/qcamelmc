-- Add check-in fields to ticket_holders table
ALTER TABLE public.ticket_holders
ADD COLUMN is_present BOOLEAN DEFAULT FALSE,
ADD COLUMN confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN confirmed_by UUID REFERENCES auth.users(id);

-- Add index for faster lookups
CREATE INDEX idx_ticket_holders_is_present ON public.ticket_holders(is_present);
CREATE INDEX idx_ticket_holders_confirmed_at ON public.ticket_holders(confirmed_at);
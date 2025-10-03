-- Create ticket_holders table to store individual attendee information
CREATE TABLE public.ticket_holders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  nationality TEXT NOT NULL,
  ticket_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ticket_holders ENABLE ROW LEVEL SECURITY;

-- Admins can view all ticket holders
CREATE POLICY "Admins can view all ticket holders"
ON public.ticket_holders
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM admin_users WHERE id = auth.uid()
));

-- Anyone can insert ticket holders (during booking)
CREATE POLICY "Anyone can create ticket holders"
ON public.ticket_holders
FOR INSERT
WITH CHECK (true);

-- Index for faster lookups
CREATE INDEX idx_ticket_holders_order_id ON public.ticket_holders(order_id);
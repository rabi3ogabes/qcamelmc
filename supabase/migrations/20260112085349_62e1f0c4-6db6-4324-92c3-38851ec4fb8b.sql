-- Create POS receipts table to store extracted receipt data
CREATE TABLE public.pos_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  amount_qar NUMERIC,
  seq_number TEXT,
  card_number_masked TEXT,
  time TEXT,
  auth_number TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.pos_receipts ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access only
CREATE POLICY "Admins can view all POS receipts" 
ON public.pos_receipts 
FOR SELECT 
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert POS receipts" 
ON public.pos_receipts 
FOR INSERT 
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update POS receipts" 
ON public.pos_receipts 
FOR UPDATE 
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete POS receipts" 
ON public.pos_receipts 
FOR DELETE 
USING (public.is_admin(auth.uid()));
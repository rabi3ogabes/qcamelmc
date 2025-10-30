-- Add column to track manual Sadad verification status
ALTER TABLE public.orders 
ADD COLUMN sadad_manually_verified boolean DEFAULT false;

-- Add index for better query performance
CREATE INDEX idx_orders_sadad_verified ON public.orders(sadad_manually_verified) WHERE sadad_manually_verified = true;
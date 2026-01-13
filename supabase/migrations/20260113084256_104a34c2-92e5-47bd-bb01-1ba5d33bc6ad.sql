-- Create POS users table
CREATE TABLE public.pos_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pos_users ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage POS users"
ON public.pos_users
FOR ALL
USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Anyone can view active POS users"
ON public.pos_users
FOR SELECT
USING (is_active = true);

-- Add pos_user_id column to orders table
ALTER TABLE public.orders ADD COLUMN pos_user_id UUID REFERENCES public.pos_users(id);

-- Add index for better query performance
CREATE INDEX idx_orders_pos_user_id ON public.orders(pos_user_id);
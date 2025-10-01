-- Create enum for payment methods
CREATE TYPE payment_method AS ENUM ('sadad', 'cash_pos');

-- Create enum for payment status
CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'cancelled');

-- Create enum for ticket types
CREATE TYPE ticket_type AS ENUM ('vip', 'normal', 'parking');

-- Create events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  image_url TEXT,
  video_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create tickets table for pricing
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  type ticket_type NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  available_quantity INTEGER NOT NULL,
  sold_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, type)
);

-- Create users/customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  ticket_type ticket_type NOT NULL,
  quantity INTEGER NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  payment_method payment_method NOT NULL,
  payment_status payment_status DEFAULT 'pending',
  payment_id TEXT,
  qr_code TEXT,
  booking_reference TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id)
);

-- Create admin users table for authentication
CREATE TABLE public.admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for events (public read)
CREATE POLICY "Anyone can view active events"
  ON public.events FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage events"
  ON public.events FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

-- RLS Policies for tickets (public read)
CREATE POLICY "Anyone can view tickets"
  ON public.tickets FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage tickets"
  ON public.tickets FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

-- RLS Policies for customers
CREATE POLICY "Anyone can create customer records"
  ON public.customers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view all customers"
  ON public.customers FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

-- RLS Policies for orders
CREATE POLICY "Anyone can create orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Customers can view their own orders"
  ON public.orders FOR SELECT
  USING (customer_id IN (SELECT id FROM public.customers));

CREATE POLICY "Admins can view all orders"
  ON public.orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

CREATE POLICY "Admins can update orders"
  ON public.orders FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

-- RLS Policies for admin_users
CREATE POLICY "Admins can view admin users"
  ON public.admin_users FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid()));

-- Function to generate booking reference
CREATE OR REPLACE FUNCTION generate_booking_reference()
RETURNS TEXT AS $$
BEGIN
  RETURN 'QTR-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for events updated_at
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert sample event data
INSERT INTO public.events (title, description, event_date, location, is_active)
VALUES (
  'Qatar National Day Festival 2025',
  'Join us for the biggest celebration of Qatar National Day with live performances, cultural exhibitions, and spectacular fireworks display.',
  '2025-12-18 18:00:00+03',
  'Aspire Park, Doha',
  true
);

-- Insert ticket types for the sample event
INSERT INTO public.tickets (event_id, type, price, available_quantity)
SELECT 
  id,
  'vip'::ticket_type,
  500.00,
  100
FROM public.events
WHERE title = 'Qatar National Day Festival 2025';

INSERT INTO public.tickets (event_id, type, price, available_quantity)
SELECT 
  id,
  'normal'::ticket_type,
  150.00,
  500
FROM public.events
WHERE title = 'Qatar National Day Festival 2025';

INSERT INTO public.tickets (event_id, type, price, available_quantity)
SELECT 
  id,
  'parking'::ticket_type,
  50.00,
  200
FROM public.events
WHERE title = 'Qatar National Day Festival 2025';
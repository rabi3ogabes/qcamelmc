-- Create table for tracking active visitors
CREATE TABLE public.active_visitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  country TEXT,
  country_code TEXT,
  city TEXT,
  current_page TEXT NOT NULL DEFAULT '/',
  referrer TEXT,
  traffic_source TEXT DEFAULT 'direct',
  device_type TEXT DEFAULT 'desktop',
  browser TEXT,
  os TEXT,
  is_new_visitor BOOLEAN DEFAULT true,
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_agent TEXT
);

-- Enable Row Level Security
ALTER TABLE public.active_visitors ENABLE ROW LEVEL SECURITY;

-- Create policy for admin users to view all visitors
CREATE POLICY "Admins can view all active visitors" 
ON public.active_visitors 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE admin_users.id = auth.uid()
  )
);

-- Create policy for anyone to insert/update their own session
CREATE POLICY "Anyone can insert their session" 
ON public.active_visitors 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update their session" 
ON public.active_visitors 
FOR UPDATE 
USING (true);

-- Create policy for anyone to delete their own session
CREATE POLICY "Anyone can delete their session" 
ON public.active_visitors 
FOR DELETE 
USING (true);

-- Create index for faster queries
CREATE INDEX idx_active_visitors_last_seen ON public.active_visitors(last_seen_at);
CREATE INDEX idx_active_visitors_session ON public.active_visitors(session_id);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_visitors;

-- Create function to clean up stale sessions (older than 5 minutes)
CREATE OR REPLACE FUNCTION public.cleanup_stale_visitors()
RETURNS void AS $$
BEGIN
  DELETE FROM public.active_visitors 
  WHERE last_seen_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
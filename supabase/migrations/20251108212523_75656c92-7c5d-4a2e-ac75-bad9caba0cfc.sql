-- Create activity_logs table for tracking user actions
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  activity_type TEXT NOT NULL CHECK (activity_type IN ('pos_form', 'qr_search', 'ticket_scan')),
  user_type TEXT NOT NULL CHECK (user_type IN ('admin', 'guest', 'system')),
  user_identifier TEXT,
  action_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT
);

-- Create indexes for better query performance
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_activity_type ON public.activity_logs(activity_type);
CREATE INDEX idx_activity_logs_user_identifier ON public.activity_logs(user_identifier);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view logs
CREATE POLICY "Admins can view all activity logs"
  ON public.activity_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

-- Policy: Anyone can insert logs (for tracking)
CREATE POLICY "Anyone can insert activity logs"
  ON public.activity_logs
  FOR INSERT
  WITH CHECK (true);

-- Policy: Only admins can delete logs
CREATE POLICY "Admins can delete activity logs"
  ON public.activity_logs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

-- Add comment for documentation
COMMENT ON TABLE public.activity_logs IS 'Tracks user activities including form submissions and searches';
COMMENT ON COLUMN public.activity_logs.activity_type IS 'Type of activity: pos_form, qr_search, ticket_scan';
COMMENT ON COLUMN public.activity_logs.user_type IS 'Type of user: admin, guest, system';
COMMENT ON COLUMN public.activity_logs.action_data IS 'JSON data containing the actual action details';
COMMENT ON COLUMN public.activity_logs.metadata IS 'Additional metadata like page URL, browser info, etc.';
-- Create popup_banners table for homepage popup management
CREATE TABLE popup_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  image_url TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE popup_banners ENABLE ROW LEVEL SECURITY;

-- Anyone can view active popup banners
CREATE POLICY "Anyone can view active popup banners"
  ON popup_banners
  FOR SELECT
  USING (is_active = true);

-- Admins can manage popup banners
CREATE POLICY "Admins can manage popup banners"
  ON popup_banners
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_popup_banners_updated_at
  BEFORE UPDATE ON popup_banners
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
-- Create storage bucket for QR codes
INSERT INTO storage.buckets (id, name, public) 
VALUES ('qr-codes', 'qr-codes', true);

-- Create RLS policies for QR code uploads
CREATE POLICY "Admins can upload QR codes"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'qr-codes' AND
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
);

CREATE POLICY "Anyone can view QR codes"
ON storage.objects
FOR SELECT
USING (bucket_id = 'qr-codes');
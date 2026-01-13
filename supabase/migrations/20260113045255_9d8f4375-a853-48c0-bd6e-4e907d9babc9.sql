-- Create storage bucket for POS receipt images
INSERT INTO storage.buckets (id, name, public)
VALUES ('pos-receipts', 'pos-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admins to upload POS receipt images
CREATE POLICY "Admins can upload POS receipt images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'pos-receipts' 
  AND EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
);

-- Allow admins to update POS receipt images
CREATE POLICY "Admins can update POS receipt images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'pos-receipts' 
  AND EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
);

-- Allow admins to delete POS receipt images
CREATE POLICY "Admins can delete POS receipt images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'pos-receipts' 
  AND EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
);

-- Allow public to view POS receipt images
CREATE POLICY "Public can view POS receipt images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'pos-receipts');
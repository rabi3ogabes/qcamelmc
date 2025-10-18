-- Allow authenticated users to upload QR codes to qr-codes bucket
CREATE POLICY "Allow authenticated users to upload QR codes"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'qr-codes');

-- Allow public read access to QR codes
CREATE POLICY "Allow public read access to QR codes"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'qr-codes');

-- Allow authenticated users to update their QR codes
CREATE POLICY "Allow authenticated users to update QR codes"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'qr-codes')
WITH CHECK (bucket_id = 'qr-codes');
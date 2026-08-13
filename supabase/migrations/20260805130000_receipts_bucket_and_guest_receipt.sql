-- Private receipts bucket for registration desk bill photos (server-side only).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "receipts: deny select to clients" ON storage.objects;
DROP POLICY IF EXISTS "receipts: deny insert to clients" ON storage.objects;
DROP POLICY IF EXISTS "receipts: deny update to clients" ON storage.objects;
DROP POLICY IF EXISTS "receipts: deny delete to clients" ON storage.objects;

CREATE POLICY "receipts: deny select to clients"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'receipts' AND false);

CREATE POLICY "receipts: deny insert to clients"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'receipts' AND false);

CREATE POLICY "receipts: deny update to clients"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'receipts' AND false)
WITH CHECK (bucket_id = 'receipts' AND false);

CREATE POLICY "receipts: deny delete to clients"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'receipts' AND false);

-- Guest receipt image columns
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS receipt_image_path text,
  ADD COLUMN IF NOT EXISTS receipt_image_url text;

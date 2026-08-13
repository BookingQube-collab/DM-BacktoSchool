-- Private store-logos bucket for company images (server-side only).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-logos',
  'store-logos',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "store-logos: deny select to clients" ON storage.objects;
DROP POLICY IF EXISTS "store-logos: deny insert to clients" ON storage.objects;
DROP POLICY IF EXISTS "store-logos: deny update to clients" ON storage.objects;
DROP POLICY IF EXISTS "store-logos: deny delete to clients" ON storage.objects;

CREATE POLICY "store-logos: deny select to clients"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'store-logos' AND false);

CREATE POLICY "store-logos: deny insert to clients"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'store-logos' AND false);

CREATE POLICY "store-logos: deny update to clients"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'store-logos' AND false)
WITH CHECK (bucket_id = 'store-logos' AND false);

CREATE POLICY "store-logos: deny delete to clients"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'store-logos' AND false);

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS logo_path text,
  ADD COLUMN IF NOT EXISTS logo_url text;

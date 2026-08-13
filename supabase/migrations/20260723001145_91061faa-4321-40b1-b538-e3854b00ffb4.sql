-- Create the private 'future-photos' bucket (server-side uploads + signed URLs).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'future-photos',
  'future-photos',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Restrict direct client access to the private 'future-photos' bucket.
-- All uploads/reads happen server-side (service role bypasses RLS); the
-- frontend receives signed URLs. No anon/authenticated role should touch
-- storage.objects for this bucket directly.

DROP POLICY IF EXISTS "future-photos: deny select to clients" ON storage.objects;
DROP POLICY IF EXISTS "future-photos: deny insert to clients" ON storage.objects;
DROP POLICY IF EXISTS "future-photos: deny update to clients" ON storage.objects;
DROP POLICY IF EXISTS "future-photos: deny delete to clients" ON storage.objects;

CREATE POLICY "future-photos: deny select to clients"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (false);

CREATE POLICY "future-photos: deny insert to clients"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "future-photos: deny update to clients"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "future-photos: deny delete to clients"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (false);

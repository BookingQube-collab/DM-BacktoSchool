-- Restrict direct client access to the private 'future-photos' bucket.
-- All uploads/reads happen server-side (service role bypasses RLS); the
-- frontend receives signed URLs. No anon/authenticated role should touch
-- storage.objects for this bucket directly.

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
-- Private branding bucket (Doha Mall logo, etc.) — service role only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding',
  'branding',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "branding: deny select to clients" ON storage.objects;
DROP POLICY IF EXISTS "branding: deny insert to clients" ON storage.objects;
DROP POLICY IF EXISTS "branding: deny update to clients" ON storage.objects;
DROP POLICY IF EXISTS "branding: deny delete to clients" ON storage.objects;

CREATE POLICY "branding: deny select to clients"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'branding' AND false);

CREATE POLICY "branding: deny insert to clients"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'branding' AND false);

CREATE POLICY "branding: deny update to clients"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'branding' AND false)
WITH CHECK (bucket_id = 'branding' AND false);

CREATE POLICY "branding: deny delete to clients"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'branding' AND false);

-- Booth branding + printer settings (set via Admin → Settings).
INSERT INTO public.app_settings (key, value)
VALUES
  ('doha_mall_logo_path', ''),
  ('doha_mall_logo_url', ''),
  ('printer_name', 'Canon SELPHY CP1500')
ON CONFLICT (key) DO NOTHING;

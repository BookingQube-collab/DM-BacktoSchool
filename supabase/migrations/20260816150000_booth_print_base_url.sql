-- Booth PC base URL for tablet/Vercel silent print (Admin → Settings).
INSERT INTO public.app_settings (key, value)
VALUES ('booth_print_base_url', '')
ON CONFLICT (key) DO NOTHING;

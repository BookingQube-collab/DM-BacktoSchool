-- Optional Wi‑Fi SELPHY LAN IP override (Admin → Settings → Printer IP).
INSERT INTO public.app_settings (key, value)
VALUES ('printer_host', '')
ON CONFLICT (key) DO NOTHING;

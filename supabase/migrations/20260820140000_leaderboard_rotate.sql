-- Full-screen /leaderboard 180° rotation (Admin → Settings).
INSERT INTO public.app_settings (key, value)
VALUES ('leaderboard_rotate', '0')
ON CONFLICT (key) DO NOTHING;

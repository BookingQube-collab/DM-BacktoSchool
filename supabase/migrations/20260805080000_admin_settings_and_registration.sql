-- App settings (API keys and admin-configurable values). Service role only.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Companies managed from the admin panel (e.g. Lulu, Max).
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companies_active_sort_idx
  ON public.companies (is_active, sort_order, name);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Guest registration desk records.
CREATE TABLE IF NOT EXISTS public.guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  amount_spent numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guests_created_at_idx ON public.guests (created_at DESC);
CREATE INDEX IF NOT EXISTS guests_company_id_idx ON public.guests (company_id);

ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;

-- Photo booth sessions for leaderboard.
CREATE TABLE IF NOT EXISTS public.photo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid REFERENCES public.guests (id) ON DELETE SET NULL,
  profession_id text NOT NULL,
  profession_title text NOT NULL,
  image_path text,
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photo_sessions_created_at_idx
  ON public.photo_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS photo_sessions_guest_id_idx
  ON public.photo_sessions (guest_id);

ALTER TABLE public.photo_sessions ENABLE ROW LEVEL SECURITY;

-- Seed default settings keys (empty values; set via admin panel).
INSERT INTO public.app_settings (key, value)
VALUES
  ('freepik_api_key', ''),
  ('event_name', 'Future Me — E3 Career Photo Booth'),
  ('admin_username', 'admin')
ON CONFLICT (key) DO NOTHING;

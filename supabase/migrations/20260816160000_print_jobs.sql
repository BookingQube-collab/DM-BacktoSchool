-- Print job queue: Vercel (HTTPS) enqueues; Windows booth worker polls and prints.
-- Service role only (no anon/authenticated policies).

CREATE TABLE IF NOT EXISTS public.print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'printing', 'done', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS print_jobs_status_created_at_idx
  ON public.print_jobs (status, created_at ASC);

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

-- Speed up profession leaderboard aggregations.
CREATE INDEX IF NOT EXISTS photo_sessions_profession_id_idx
  ON public.photo_sessions (profession_id);

CREATE INDEX IF NOT EXISTS photo_sessions_profession_created_at_idx
  ON public.photo_sessions (profession_id, created_at DESC);

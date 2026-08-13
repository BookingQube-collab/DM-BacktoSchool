-- Deduplicate company names (case-insensitive), then enforce uniqueness.

-- Prefer the row with a logo; otherwise keep the oldest.
WITH ranked AS (
  SELECT
    id,
    lower(trim(name)) AS name_key,
    row_number() OVER (
      PARTITION BY lower(trim(name))
      ORDER BY
        (logo_path IS NOT NULL OR logo_url IS NOT NULL) DESC,
        created_at ASC,
        id ASC
    ) AS rn
  FROM public.companies
),
keepers AS (
  SELECT id, name_key FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dupe_id, k.id AS keep_id
  FROM ranked r
  JOIN keepers k ON k.name_key = r.name_key
  WHERE r.rn > 1
)
UPDATE public.guests g
SET company_id = d.keep_id
FROM dupes d
WHERE g.company_id = d.dupe_id;

WITH ranked AS (
  SELECT
    id,
    lower(trim(name)) AS name_key,
    row_number() OVER (
      PARTITION BY lower(trim(name))
      ORDER BY
        (logo_path IS NOT NULL OR logo_url IS NOT NULL) DESC,
        created_at ASC,
        id ASC
    ) AS rn
  FROM public.companies
)
DELETE FROM public.companies c
USING ranked r
WHERE c.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS companies_name_unique_ci
  ON public.companies (lower(trim(name)));

-- Allow one guest registration to reference multiple stores.
-- company_id stays populated with the first selected store so existing
-- queries and single-store rows keep working.

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS company_ids uuid[] NOT NULL DEFAULT '{}';

UPDATE public.guests
SET company_ids = ARRAY[company_id]
WHERE company_id IS NOT NULL
  AND cardinality(company_ids) = 0;

CREATE INDEX IF NOT EXISTS guests_company_ids_gin_idx
  ON public.guests USING GIN (company_ids);

CREATE OR REPLACE FUNCTION public.sync_guest_company_ids_on_company_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.guests
  SET
    company_ids = array_remove(company_ids, OLD.id),
    company_id = CASE
      WHEN company_id = OLD.id THEN NULL
      ELSE company_id
    END
  WHERE company_id = OLD.id OR OLD.id = ANY (company_ids);

  UPDATE public.guests
  SET company_id = company_ids[1]
  WHERE company_id IS NULL AND cardinality(company_ids) > 0;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS companies_sync_guest_company_ids ON public.companies;
CREATE TRIGGER companies_sync_guest_company_ids
BEFORE DELETE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.sync_guest_company_ids_on_company_delete();

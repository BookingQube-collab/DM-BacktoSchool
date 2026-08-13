-- Expand guests table for Doha Mall Back to School registration desk.
ALTER TABLE public.guests RENAME COLUMN name TO first_name;
ALTER TABLE public.guests RENAME COLUMN phone TO mobile;
ALTER TABLE public.guests RENAME COLUMN amount_spent TO transaction_value;

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nationality text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_zone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS transaction_date date NOT NULL DEFAULT (CURRENT_DATE);

CREATE INDEX IF NOT EXISTS guests_transaction_date_idx
  ON public.guests (transaction_date DESC);

CREATE INDEX IF NOT EXISTS guests_store_date_idx
  ON public.guests (company_id, transaction_date DESC);

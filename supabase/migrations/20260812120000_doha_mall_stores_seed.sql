-- Seed Doha Mall store directory (57 brands) into companies.
-- Skips rows whose name already exists (case-insensitive).

WITH seed(name, sort_order) AS (
  VALUES
    ('Adidas', 1),
    ('Al-Jazeera Perfumes', 2),
    ('ANTA', 3),
    ('Aseel', 4),
    ('A''Saffa', 5),
    ('Abdul Samad Al Qurashi', 6),
    ('Al Meera', 7),
    ('ALDO', 8),
    ('ARDENE', 9),
    ('ASICS', 10),
    ('ACO.', 11),
    ('Babyshop', 12),
    ('BBZ', 13),
    ('Berry Lush', 14),
    ('Bath & Body Works', 15),
    ('Beverly Hills Polo Club', 16),
    ('BIRKENSTOCK', 17),
    ('Brands For Less', 18),
    ('Call It Spring', 19),
    ('Cosmo', 20),
    ('Damat', 21),
    ('Crocs', 22),
    ('DOCTOR M', 23),
    ('Dollar Plus', 24),
    ('Dune London', 25),
    ('Dumond', 26),
    ('FLO', 27),
    ('GIORDANO', 28),
    ('Hema', 29),
    ('Ipanema', 30),
    ('Jashanmal', 31),
    ('Jawahir', 32),
    ('KOTON', 33),
    ('Kulud', 34),
    ('La Senza', 35),
    ('La Vie en Rose', 36),
    ('LC WAIKIKI', 37),
    ('LEVI''S', 38),
    ('Lulu Hypermarket', 39),
    ('max', 40),
    ('MUMUSO', 41),
    ('NEW YORKER', 42),
    ('NINE WEST', 43),
    ('R&B', 44),
    ('Rasasi', 45),
    ('Rituals', 46),
    ('SKECHERS', 47),
    ('Splash', 48),
    ('STEVE MADDEN', 49),
    ('SIVAS', 50),
    ('SIZE?', 51),
    ('TOMS', 52),
    ('LQ', 53),
    ('Verona', 54),
    ('VOILE', 55),
    ('VIP', 56),
    ('Women''s Secret', 57)
),
inserted AS (
  INSERT INTO public.companies (name, is_active, sort_order)
  SELECT s.name, true, s.sort_order
  FROM seed s
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE lower(trim(c.name)) = lower(trim(s.name))
  )
  RETURNING id, name, sort_order
),
updated AS (
  UPDATE public.companies c
  SET
    sort_order = s.sort_order,
    updated_at = now()
  FROM seed s
  WHERE lower(trim(c.name)) = lower(trim(s.name))
  RETURNING c.id, c.name, c.sort_order
)
SELECT
  (SELECT count(*) FROM inserted) AS inserted_count,
  (SELECT count(*) FROM updated) AS updated_sort_order_count,
  (SELECT count(*) FROM seed) AS seed_total;

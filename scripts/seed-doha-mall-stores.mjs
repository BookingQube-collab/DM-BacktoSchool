import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres.vugvmotgwgdzqadiculo:EEEQatar2022@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";

const migrationPath = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260812120000_doha_mall_stores_seed.sql",
);

const client = new pg.Client({ connectionString });

try {
  await client.connect();

  const before = await client.query(
    "SELECT name FROM public.companies ORDER BY sort_order, name",
  );
  console.log("Before:", before.rows.length, "stores");

  const sql = fs.readFileSync(migrationPath, "utf8");
  const result = await client.query(sql);
  const summary = result.rows?.[0] ?? {};

  const after = await client.query(
    "SELECT name, sort_order FROM public.companies ORDER BY sort_order, name",
  );

  const seedNames = [
    "Adidas",
    "Al-Jazeera Perfumes",
    "ANTA",
    "Aseel",
    "A'Saffa",
    "Abdul Samad Al Qurashi",
    "Al Meera",
    "ALDO",
    "ARDENE",
    "ASICS",
    "ACO.",
    "Babyshop",
    "BBZ",
    "Berry Lush",
    "Bath & Body Works",
    "Beverly Hills Polo Club",
    "BIRKENSTOCK",
    "Brands For Less",
    "Call It Spring",
    "Cosmo",
    "Damat",
    "Crocs",
    "DOCTOR M",
    "Dollar Plus",
    "Dune London",
    "Dumond",
    "FLO",
    "GIORDANO",
    "Hema",
    "Ipanema",
    "Jashanmal",
    "Jawahir",
    "KOTON",
    "Kulud",
    "La Senza",
    "La Vie en Rose",
    "LC WAIKIKI",
    "LEVI'S",
    "Lulu Hypermarket",
    "max",
    "MUMUSO",
    "NEW YORKER",
    "NINE WEST",
    "R&B",
    "Rasasi",
    "Rituals",
    "SKECHERS",
    "Splash",
    "STEVE MADDEN",
    "SIVAS",
    "SIZE?",
    "TOMS",
    "LQ",
    "Verona",
    "VOILE",
    "VIP",
    "Women's Secret",
  ];

  const afterNamesLower = new Set(
    after.rows.map((r) => r.name.trim().toLowerCase()),
  );
  const skipped = seedNames.filter(
    (name) => !afterNamesLower.has(name.trim().toLowerCase()),
  );
  const preExisting = before.rows
    .map((r) => r.name)
    .filter((name) =>
      seedNames.some(
        (seed) => seed.trim().toLowerCase() === name.trim().toLowerCase(),
      ),
    );

  console.log("\nMigration summary:", summary);
  console.log("After:", after.rows.length, "stores total");
  console.log("Inserted:", summary.inserted_count ?? "n/a");
  console.log("Updated sort_order for existing:", summary.updated_sort_order_count ?? "n/a");
  console.log("Skipped duplicates (pre-existing):", preExisting.join(", ") || "(none)");
  if (skipped.length) {
    console.log("WARNING missing from DB after seed:", skipped.join(", "));
  }
} finally {
  await client.end();
}

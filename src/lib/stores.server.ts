export type StoreSummary = {
  id: string;
  name: string;
  logo_url: string | null;
};

export const FEATURED_STORE_LIMIT = 10;

/** Popular Doha Mall brands shown when no registration data exists yet. */
export const TOP_BRAND_NAMES = [
  "Lulu Hypermarket",
  "max",
  "Adidas",
  "Bath & Body Works",
  "LC WAIKIKI",
  "SKECHERS",
  "Babyshop",
  "Crocs",
  "Splash",
  "LEVI'S",
  "GIORDANO",
  "Rituals",
] as const;

export type GuestAggRow = {
  company_id: string | null;
  transaction_value: number | null;
};

export function aggregateGuestCounts(guests: GuestAggRow[]) {
  const counts = new Map<string, { receipts: number; transaction_value: number }>();

  for (const row of guests) {
    if (!row.company_id) continue;
    const existing = counts.get(row.company_id) ?? {
      receipts: 0,
      transaction_value: 0,
    };
    existing.receipts += 1;
    existing.transaction_value += Number(row.transaction_value || 0);
    counts.set(row.company_id, existing);
  }

  return counts;
}

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function matchesTopBrand(storeName: string, brandName: string) {
  const store = normalizeName(storeName);
  const brand = normalizeName(brandName);
  return store === brand || store.includes(brand) || brand.includes(store);
}

export function pickFeaturedBySales(
  stores: StoreSummary[],
  counts: Map<string, { receipts: number; transaction_value: number }>,
  limit = FEATURED_STORE_LIMIT,
) {
  const activeIds = new Set(stores.map((s) => s.id));
  const ranked = [...counts.entries()]
    .filter(([id]) => activeIds.has(id))
    .sort((a, b) => {
      if (b[1].receipts !== a[1].receipts) return b[1].receipts - a[1].receipts;
      return b[1].transaction_value - a[1].transaction_value;
    })
    .slice(0, limit);

  const byId = new Map(stores.map((s) => [s.id, s]));
  return ranked
    .map(([id]) => byId.get(id))
    .filter((s): s is StoreSummary => Boolean(s));
}

export function pickTopBrandFallback(
  stores: StoreSummary[],
  limit = FEATURED_STORE_LIMIT,
) {
  const picked: StoreSummary[] = [];
  const used = new Set<string>();

  for (const brand of TOP_BRAND_NAMES) {
    if (picked.length >= limit) break;
    const match = stores.find(
      (s) => !used.has(s.id) && matchesTopBrand(s.name, brand),
    );
    if (match) {
      picked.push(match);
      used.add(match.id);
    }
  }

  const withLogos = stores.filter((s) => s.logo_url && !used.has(s.id));
  for (const store of withLogos) {
    if (picked.length >= limit) break;
    picked.push(store);
    used.add(store.id);
  }

  for (const store of stores) {
    if (picked.length >= limit) break;
    if (used.has(store.id)) continue;
    picked.push(store);
    used.add(store.id);
  }

  return picked;
}

export function searchStores(
  stores: StoreSummary[],
  query: string,
  limit = 12,
) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return stores
    .filter((s) => s.name.toLowerCase().includes(q))
    .slice(0, limit);
}

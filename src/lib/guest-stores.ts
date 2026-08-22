export type StoreRef = { id: string; name: string };

export const STORE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isStoreId(value: string) {
  return STORE_ID_RE.test(value);
}

/** Unique store ids, preserving first-seen order. */
export function uniqueStoreIds(ids: Iterable<string>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Accept `company_ids` plus optional legacy `company_id`. */
export function normalizeStoreIds(ids: unknown, fallbackId?: unknown): string[] {
  const collected: string[] = [];
  if (Array.isArray(ids)) {
    for (const value of ids) {
      const id = String(value ?? "").trim();
      if (id) collected.push(id);
    }
  } else if (typeof ids === "string" && ids.trim()) {
    collected.push(ids.trim());
  }

  const fallback = typeof fallbackId === "string" ? fallbackId.trim() : "";
  if (fallback && !collected.includes(fallback)) {
    collected.unshift(fallback);
  }

  return uniqueStoreIds(collected);
}

/** Read both the new array and the legacy single `company_id`. */
export function resolveGuestStoreIds(row: {
  company_id?: string | null;
  company_ids?: string[] | null;
}): string[] {
  return normalizeStoreIds(row.company_ids, row.company_id);
}

export function formatStoreNames(names: string[], fallback = "Unassigned") {
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(", ") : fallback;
}

export function mapStoreRefs(ids: string[], nameById: Map<string, string>, fallback = "Unassigned") {
  return ids.map((id) => ({
    id,
    name: nameById.get(id) || fallback,
  }));
}

export type GuestStoreFilterMode = "company_ids" | "company_id";

/**
 * Filter guests that include this store.
 * Uses `company_ids` (GIN contains) so it can AND with a later search `.or()`.
 * When that column is not migrated yet, fall back to legacy `company_id`.
 */
export function applyGuestStoreFilter<T>(
  query: T,
  storeId: string,
  mode: GuestStoreFilterMode = "company_ids",
): T {
  if (!isStoreId(storeId)) return query;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = query as any;
  if (mode === "company_id") return q.eq("company_id", storeId) as T;
  return q.contains("company_ids", [storeId]) as T;
}

export function isMissingCompanyIdsColumn(
  error: { message?: string; code?: string; details?: string } | null | undefined,
) {
  if (!error) return false;
  const text = [error.message, error.details, error.code].filter(Boolean).join(" ");
  if (!/company_ids/i.test(text)) return false;
  return (
    /does not exist/i.test(text) ||
    /could not find/i.test(text) ||
    /PGRST204/i.test(text)
  );
}

/** Drop `company_ids` from a PostgREST select list. */
export function omitCompanyIdsSelect(select: string) {
  return select
    .replace(/\s*,\s*company_ids\b/g, "")
    .replace(/\bcompany_ids\s*,\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

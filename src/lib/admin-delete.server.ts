import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getAdminUsername,
  verifyAdminCredentials,
} from "@/lib/settings.server";

const STORAGE_BATCH = 100;

export async function verifyAdminPasswordOnly(password: string) {
  const username = await getAdminUsername();
  return verifyAdminCredentials(username, password);
}

async function removeStoragePaths(bucket: string, paths: string[]) {
  const unique = [...new Set(paths.map((p) => p?.trim()).filter(Boolean))];
  for (let i = 0; i < unique.length; i += STORAGE_BATCH) {
    const chunk = unique.slice(i, i + STORAGE_BATCH);
    const { error } = await supabaseAdmin.storage.from(bucket).remove(chunk);
    if (error) {
      console.warn(`[admin-delete] ${bucket} remove failed:`, error.message);
    }
  }
  return unique.length;
}

/** List every object path in a private bucket (flat + one-level folders). */
async function listBucketPaths(bucket: string): Promise<string[]> {
  const paths: string[] = [];

  async function walk(prefix: string) {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, {
        limit: STORAGE_BATCH,
        offset,
      });
      if (error || !data?.length) break;

      for (const item of data) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        // Folders have null id in Supabase Storage listings.
        if (item.id == null) {
          await walk(path);
        } else {
          paths.push(path);
        }
      }

      if (data.length < STORAGE_BATCH) break;
      offset += STORAGE_BATCH;
    }
  }

  await walk("");
  return paths;
}

export async function deleteGuestRows(
  rows: Array<{ id: string; receipt_image_path?: string | null }>,
) {
  if (!rows.length) return { deleted: 0, receipts_removed: 0 };

  const paths = rows
    .map((r) => r.receipt_image_path)
    .filter((p): p is string => Boolean(p));
  const ids = rows.map((r) => r.id);

  for (let i = 0; i < ids.length; i += STORAGE_BATCH) {
    const chunk = ids.slice(i, i + STORAGE_BATCH);
    const { error } = await supabaseAdmin.from("guests").delete().in("id", chunk);
    if (error) throw new Error(error.message);
  }

  const receipts_removed = await removeStoragePaths("receipts", paths);
  return { deleted: ids.length, receipts_removed };
}

export async function deletePhotoSessionRows(
  rows: Array<{ id: string; image_path?: string | null }>,
) {
  if (!rows.length) return { deleted: 0, photos_removed: 0 };

  const paths = rows
    .map((r) => r.image_path)
    .filter((p): p is string => Boolean(p));
  const ids = rows.map((r) => r.id);

  for (let i = 0; i < ids.length; i += STORAGE_BATCH) {
    const chunk = ids.slice(i, i + STORAGE_BATCH);
    const { error } = await supabaseAdmin
      .from("photo_sessions")
      .delete()
      .in("id", chunk);
    if (error) throw new Error(error.message);
  }

  const photos_removed = await removeStoragePaths("future-photos", paths);
  return { deleted: ids.length, photos_removed };
}

export async function deleteGuestById(id: string) {
  const { data, error } = await supabaseAdmin
    .from("guests")
    .select("id, receipt_image_path")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { deleted: 0, receipts_removed: 0 };
  return deleteGuestRows([data]);
}

export async function deletePhotoSessionById(id: string) {
  const { data, error } = await supabaseAdmin
    .from("photo_sessions")
    .select("id, image_path")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { deleted: 0, photos_removed: 0 };
  return deletePhotoSessionRows([data]);
}

function sanitizeSearchTerm(raw: string) {
  return raw
    .trim()
    .replace(/[%_,."*()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

/** PostgREST or() clause for guest name / email / mobile search. */
export function guestSearchOrFilter(q: string) {
  const term = sanitizeSearchTerm(q);
  if (!term) return null;
  const pattern = `%${term}%`;
  return `first_name.ilike."${pattern}",last_name.ilike."${pattern}",email.ilike."${pattern}",mobile.ilike."${pattern}"`;
}

export async function deleteGuestsFiltered(opts: {
  from?: string;
  to?: string;
  storeId?: string | null;
  q?: string | null;
  nationality?: string | null;
  zone?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  all?: boolean;
}) {
  let query = supabaseAdmin
    .from("guests")
    .select("id, receipt_image_path");

  if (!opts.all) {
    if (opts.from) query = query.gte("transaction_date", opts.from);
    if (opts.to) query = query.lte("transaction_date", opts.to);
    if (opts.storeId) query = query.eq("company_id", opts.storeId);
    if (opts.nationality) query = query.eq("nationality", opts.nationality);
    if (opts.zone) query = query.eq("address_zone", opts.zone);
    if (opts.minValue != null && Number.isFinite(opts.minValue)) {
      query = query.gte("transaction_value", opts.minValue);
    }
    if (opts.maxValue != null && Number.isFinite(opts.maxValue)) {
      query = query.lte("transaction_value", opts.maxValue);
    }
    const searchOr = opts.q ? guestSearchOrFilter(opts.q) : null;
    if (searchOr) query = query.or(searchOr);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return deleteGuestRows(data ?? []);
}

export async function deletePhotoSessionsFiltered(opts: {
  from?: string;
  to?: string;
  all?: boolean;
  dayStartIso?: (date: string) => string;
  dayEndIso?: (date: string) => string;
}) {
  let query = supabaseAdmin.from("photo_sessions").select("id, image_path");

  if (!opts.all && opts.from && opts.to && opts.dayStartIso && opts.dayEndIso) {
    query = query
      .gte("created_at", opts.dayStartIso(opts.from))
      .lte("created_at", opts.dayEndIso(opts.to));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return deletePhotoSessionRows(data ?? []);
}

export async function deleteAllCompanies() {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, logo_path");
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (!rows.length) return { deleted: 0, logos_removed: 0 };

  const { error: delErr } = await supabaseAdmin
    .from("companies")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) throw new Error(delErr.message);

  const logos_removed = await removeStoragePaths(
    "store-logos",
    rows.map((r) => r.logo_path).filter((p): p is string => Boolean(p)),
  );
  return { deleted: rows.length, logos_removed };
}

/**
 * Clears event activity: all guests + photo_sessions and their storage files.
 * Does not touch companies, branding, or app_settings (admin auth, etc.).
 */
export async function purgeEventActivity() {
  const [photosSelect, guestsSelect] = await Promise.all([
    supabaseAdmin.from("photo_sessions").select("id, image_path"),
    supabaseAdmin.from("guests").select("id, receipt_image_path"),
  ]);

  if (photosSelect.error) throw new Error(photosSelect.error.message);
  if (guestsSelect.error) throw new Error(guestsSelect.error.message);

  const photos = await deletePhotoSessionRows(photosSelect.data ?? []);
  const guests = await deleteGuestRows(guestsSelect.data ?? []);

  // Sweep any orphaned objects left in the activity buckets.
  const [orphanPhotos, orphanReceipts] = await Promise.all([
    listBucketPaths("future-photos"),
    listBucketPaths("receipts"),
  ]);
  const sweptPhotos = await removeStoragePaths("future-photos", orphanPhotos);
  const sweptReceipts = await removeStoragePaths("receipts", orphanReceipts);

  return {
    guests_deleted: guests.deleted,
    photos_deleted: photos.deleted,
    receipts_removed: Math.max(guests.receipts_removed, sweptReceipts),
    photos_removed: Math.max(photos.photos_removed, sweptPhotos),
  };
}

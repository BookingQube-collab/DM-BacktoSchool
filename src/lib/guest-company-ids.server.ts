import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import {
  isMissingCompanyIdsColumn,
  omitCompanyIdsSelect,
  type GuestStoreFilterMode,
} from "@/lib/guest-stores";

type GuestInsert = Database["public"]["Tables"]["guests"]["Insert"];
type GuestUpdate = Database["public"]["Tables"]["guests"]["Update"];
type GuestError = { message: string; code?: string; details?: string };
type GuestResult<T> = { data: T | null; error: GuestError | null };

/** Process-local: null until the first company_ids query succeeds or is rejected. */
let companyIdsAvailable: boolean | null = null;

export function usesGuestCompanyIds() {
  return companyIdsAvailable !== false;
}

export function guestStoreFilterMode(): GuestStoreFilterMode {
  return companyIdsAvailable === false ? "company_id" : "company_ids";
}

export function guestSelect(select: string) {
  return companyIdsAvailable === false ? omitCompanyIdsSelect(select) : select;
}

export function guestWriteRow<T extends { company_ids?: unknown }>(row: T): T | Omit<T, "company_ids"> {
  if (companyIdsAvailable === false) {
    const { company_ids: _ids, ...rest } = row;
    return rest;
  }
  return row;
}

/** Returns true when the caller should retry without `company_ids`. */
export function noteGuestCompanyIdsResult(
  error: { message?: string; code?: string; details?: string } | null | undefined,
  attemptedCompanyIds: boolean,
) {
  if (error) {
    if (attemptedCompanyIds && isMissingCompanyIdsColumn(error)) {
      companyIdsAvailable = false;
      return true;
    }
    return false;
  }
  if (attemptedCompanyIds) companyIdsAvailable = true;
  return false;
}

export async function selectGuests<T>(
  build: (select: string) => PromiseLike<{ data: unknown; error: GuestError | null }>,
  select: string,
): Promise<GuestResult<T>> {
  const attempted = usesGuestCompanyIds() && select.includes("company_ids");
  const first = await build(guestSelect(select));
  if (noteGuestCompanyIdsResult(first.error, attempted)) {
    const retry = await build(guestSelect(select));
    return { data: (retry.data as T | null) ?? null, error: retry.error };
  }
  return { data: (first.data as T | null) ?? null, error: first.error };
}

export async function insertGuest(row: GuestInsert) {
  const attempted = usesGuestCompanyIds() && row.company_ids != null;
  const first = await supabaseAdmin
    .from("guests")
    .insert(guestWriteRow(row) as GuestInsert)
    .select("id")
    .single();
  if (noteGuestCompanyIdsResult(first.error, attempted)) {
    return supabaseAdmin
      .from("guests")
      .insert(guestWriteRow(row) as GuestInsert)
      .select("id")
      .single();
  }
  return first;
}

export async function updateGuestById<T>(
  id: string,
  row: GuestUpdate,
  select: string,
): Promise<GuestResult<T>> {
  const attempted = usesGuestCompanyIds();
  const run = (sel: string) =>
    supabaseAdmin
      .from("guests")
      .update(guestWriteRow(row) as GuestUpdate)
      .eq("id", id)
      .select(sel)
      .maybeSingle();

  const first = await run(guestSelect(select));
  if (noteGuestCompanyIdsResult(first.error, attempted)) {
    const retry = await run(guestSelect(select));
    return { data: (retry.data as T | null) ?? null, error: retry.error };
  }
  return { data: (first.data as T | null) ?? null, error: first.error };
}

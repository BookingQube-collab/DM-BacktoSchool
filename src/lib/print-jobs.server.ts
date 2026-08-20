import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PrintJobStatus = "pending" | "printing" | "done" | "failed";

export type PrintJob = {
  id: string;
  image_url: string;
  status: PrintJobStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

/**
 * Cloud/Vercel must never IPP-print. Only the Windows booth PC talks to SELPHY.
 * Check VERCEL first so a Windows-built bundle still queues on serverless.
 */
export function shouldEnqueuePrintForBoothWorker(): boolean {
  if (typeof process === "undefined") return true;
  if (process.env.VERCEL || process.env.VERCEL_ENV) return true;
  return process.platform !== "win32";
}

/** Enqueue a print job for the Windows booth worker (Vercel / non-Windows path). */
export async function enqueuePrintJob(imageUrl: string): Promise<PrintJob> {
  const trimmed = imageUrl.trim();
  if (!trimmed) {
    throw new Error("imageUrl is required to queue a print job");
  }

  const { data, error } = await supabaseAdmin
    .from("print_jobs")
    .insert({
      image_url: trimmed,
      status: "pending",
      updated_at: nowIso(),
    })
    .select("id, image_url, status, error, created_at, updated_at")
    .single();

  if (error) throw new Error(error.message);
  return data as PrintJob;
}

export async function getPrintJob(id: string): Promise<PrintJob | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  const { data, error } = await supabaseAdmin
    .from("print_jobs")
    .select("id, image_url, status, error, created_at, updated_at")
    .eq("id", trimmed)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PrintJob | null) ?? null;
}

/** Re-queue jobs left in "printing" after a worker crash / hung IPP. */
const STALE_PRINTING_MS = 120_000;

export async function reclaimStalePrintJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_PRINTING_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("print_jobs")
    .update({
      status: "pending",
      error: "reclaimed after stall",
      updated_at: nowIso(),
    })
    .eq("status", "printing")
    .lt("updated_at", cutoff)
    .select("id");

  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Claim the oldest pending job (optimistic lock via status=pending filter). */
export async function claimNextPrintJob(): Promise<PrintJob | null> {
  const { data: pending, error: listError } = await supabaseAdmin
    .from("print_jobs")
    .select("id, image_url, status, error, created_at, updated_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (listError) throw new Error(listError.message);
  const job = pending?.[0] as PrintJob | undefined;
  if (!job) return null;

  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("print_jobs")
    .update({ status: "printing", updated_at: nowIso(), error: null })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("id, image_url, status, error, created_at, updated_at")
    .maybeSingle();

  if (claimError) throw new Error(claimError.message);
  return (claimed as PrintJob | null) ?? null;
}

export async function markPrintJobDone(id: string) {
  const { error } = await supabaseAdmin
    .from("print_jobs")
    .update({ status: "done", error: null, updated_at: nowIso() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markPrintJobFailed(id: string, message: string) {
  const { error } = await supabaseAdmin
    .from("print_jobs")
    .update({
      status: "failed",
      error: message.slice(0, 500),
      updated_at: nowIso(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

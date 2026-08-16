/**
 * Windows booth print worker — polls Supabase print_jobs and silent-prints via IPP.
 * Started only when process.platform === "win32" (local booth `npm run dev`).
 */
import {
  claimNextPrintJob,
  markPrintJobDone,
  markPrintJobFailed,
} from "@/lib/print-jobs.server";
import {
  fetchPrintableImageBytes,
  printPostcardImageBytes,
  resolvePrinterName,
} from "@/lib/print.server";

const POLL_MS = 2_500;

let started = false;
let ticking = false;

async function processOneJob() {
  const job = await claimNextPrintJob();
  if (!job) return;

  console.log(`[print-worker] printing job ${job.id}`);
  try {
    const printerName = await resolvePrinterName();
    await printPostcardImageBytes(
      await fetchPrintableImageBytes(job.image_url),
      printerName,
    );
    await markPrintJobDone(job.id);
    console.log(`[print-worker] done job ${job.id}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[print-worker] failed job ${job.id}:`, message);
    try {
      await markPrintJobFailed(job.id, message);
    } catch (markErr) {
      console.error("[print-worker] could not mark failed:", markErr);
    }
  }
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    // Drain a few pending jobs per tick so a backlog clears without blocking forever.
    for (let i = 0; i < 3; i++) {
      await processOneJob();
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Avoid log spam before migration is applied.
    if (/print_jobs|schema cache/i.test(message)) {
      if (!(globalThis as { __printJobsMissingLogged?: boolean }).__printJobsMissingLogged) {
        (globalThis as { __printJobsMissingLogged?: boolean }).__printJobsMissingLogged =
          true;
        console.error(
          "[print-worker] print_jobs table missing — apply migration 20260816160000_print_jobs.sql",
          message,
        );
      }
    } else {
      console.error("[print-worker] tick error:", e);
    }
  } finally {
    ticking = false;
  }
}

/** Idempotent — safe to call from server entry and /api/print. */
export function startPrintWorker() {
  if (started) return;
  if (typeof process === "undefined" || process.platform !== "win32") return;

  started = true;
  console.log(
    `[print-worker] polling print_jobs every ${POLL_MS}ms (keep npm run dev running)`,
  );
  void tick();
  setInterval(() => {
    void tick();
  }, POLL_MS);
}

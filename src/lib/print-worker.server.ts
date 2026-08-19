/**
 * Windows booth print worker — polls Supabase print_jobs and silent-prints via IPP.
 * Started only when process.platform === "win32" (booth PC `npm run booth`).
 */
import {
  claimNextPrintJob,
  markPrintJobDone,
  markPrintJobFailed,
  reclaimStalePrintJobs,
} from "@/lib/print-jobs.server";
import {
  fetchPrintableImageBytes,
  printPostcardImageBytes,
  resolvePrinterName,
} from "@/lib/print.server";
import { setSetting } from "@/lib/settings.server";

const POLL_MS = 2_500;
/** Must finish before the tablet's ~90s poll so guests see done/failed, not a hang. */
const JOB_TIMEOUT_MS = 70_000;

let started = false;
let ticking = false;
let lastHeartbeatAt = 0;

async function writeWorkerHeartbeat() {
  const now = Date.now();
  if (now - lastHeartbeatAt < 8_000) return;
  lastHeartbeatAt = now;
  try {
    await setSetting("print_worker_heartbeat", new Date().toISOString());
  } catch (err) {
    console.error("[print-worker] heartbeat failed:", err);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function processOneJob() {
  const job = await claimNextPrintJob();
  if (!job) return;

  console.log(`[print-worker] printing job ${job.id}`);
  try {
    await withTimeout(
      (async () => {
        const printerName = await resolvePrinterName();
        await printPostcardImageBytes(
          await fetchPrintableImageBytes(job.image_url),
          printerName,
        );
      })(),
      JOB_TIMEOUT_MS,
      "Print timed out on the booth PC — check SELPHY power, Wi‑Fi, and paper.",
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
    await writeWorkerHeartbeat();
    const reclaimed = await reclaimStalePrintJobs();
    if (reclaimed > 0) {
      console.warn(
        `[print-worker] reclaimed ${reclaimed} stalled printing job(s)`,
      );
    }
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
    `[print-worker] polling print_jobs every ${POLL_MS}ms (keep the booth PC on)`,
  );
  void tick();
  setInterval(() => {
    void tick();
  }, POLL_MS);
}

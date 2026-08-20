/**
 * Windows booth print worker — polls Supabase print_jobs and silent-prints via IPP.
 * Started only when process.platform === "win32" (booth PC `npm run booth`).
 */
import dns from "node:dns";
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
import {
  isPrintWorkerHeartbeatFresh,
  touchPrintWorkerHeartbeat,
} from "@/lib/settings.server";

const POLL_MS = 2_500;
/** Independent of job processing so heartbeat stays fresh during IPP. */
const HEARTBEAT_MS = 8_000;
/** Must finish before the tablet's 120s poll (logo + IPP discover + slow ACK). */
const JOB_TIMEOUT_MS = 105_000;
/** Don't leave `ticking` stuck if Supabase list/claim hangs. */
const QUEUE_OP_TIMEOUT_MS = 15_000;

let started = false;
let ticking = false;
let heartbeatOkLogged = false;

async function writeWorkerHeartbeat() {
  try {
    await touchPrintWorkerHeartbeat();
    if (!heartbeatOkLogged) {
      heartbeatOkLogged = true;
      console.log("[print-worker] heartbeat ok (print_worker_heartbeat)");
    }
  } catch (err) {
    heartbeatOkLogged = false;
    console.error("[print-worker] heartbeat failed:", err);
  }
}

function startHeartbeatPump() {
  void writeWorkerHeartbeat();
  const id = setInterval(() => {
    void writeWorkerHeartbeat();
  }, HEARTBEAT_MS);
  return () => clearInterval(id);
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

async function claimNextOrRetry() {
  try {
    return await withTimeout(
      claimNextPrintJob(),
      QUEUE_OP_TIMEOUT_MS,
      "claimNextPrintJob timed out talking to the print queue",
    );
  } catch (err) {
    console.error("[print-worker] claim failed, retrying:", err);
    return await withTimeout(
      claimNextPrintJob(),
      QUEUE_OP_TIMEOUT_MS,
      "claimNextPrintJob timed out talking to the print queue",
    );
  }
}

async function processOneJob() {
  const job = await claimNextOrRetry();
  if (!job) return;

  console.log(`[print-worker] printing job ${job.id}`);
  const imageRef = job.image_url.split("?")[0] || job.image_url;
  console.log(`[print-worker] image ${imageRef.slice(0, 160)}`);
  // Keep heartbeat fresh during long IPP / PowerShell so Vercel does not
  // treat the booth PC as offline while the SELPHY is still printing.
  const stopHeartbeat = startHeartbeatPump();
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
    const stored =
      /^fetch failed$/i.test(message) || /^failed to fetch$/i.test(message)
        ? "Could not download print image (network). Check the booth PC can reach Supabase, then retry."
        : message;
    console.error(`[print-worker] failed job ${job.id}:`, stored);
    try {
      await markPrintJobFailed(job.id, stored);
    } catch (markErr) {
      console.error("[print-worker] could not mark failed:", markErr);
    }
  } finally {
    stopHeartbeat();
    await writeWorkerHeartbeat();
  }
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    // Live heartbeat means the worker is mid-IPP — do not steal that job.
    const heartbeatFresh = await isPrintWorkerHeartbeatFresh();
    const reclaimed = heartbeatFresh
      ? 0
      : await withTimeout(
          reclaimStalePrintJobs(),
          QUEUE_OP_TIMEOUT_MS,
          "reclaimStalePrintJobs timed out talking to the print queue",
        );
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
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {
    /* Node < 17 */
  }
  console.log(
    `[print-worker] polling print_jobs every ${POLL_MS}ms (keep the booth PC on)`,
  );
  startHeartbeatPump();
  void tick();
  setInterval(() => {
    void tick();
  }, POLL_MS);
}

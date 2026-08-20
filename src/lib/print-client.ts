/** Guest/admin tablet print — Vercel queues; booth PC worker silent-prints the photo. */

/** Abort only the enqueue/direct POST — never the status poll or countdown overlay. */
export const SILENT_PRINT_POST_TIMEOUT_MS = 120_000;
/** Admin reprint POST is Vercel enqueue only — fail fast if it hangs. */
export const PRINT_QUEUE_POST_TIMEOUT_MS = 25_000;
/** Queue poll after POST returns. Covers worker pickup + slow SELPHY IPP ACK. */
export const PRINT_POLL_TIMEOUT_MS = 120_000;
/** Job still `pending` after a stale heartbeat and nothing `printing`. */
export const PRINT_PENDING_NO_WORKER_MS = 18_000;
/** Missing heartbeat (old booth copy) is not proof the window is closed. */
const PRINT_PENDING_UNKNOWN_WORKER_MS = 60_000;
/** Per-request timeout so a hung `/api/print/status` cannot freeze the overlay. */
const PRINT_STATUS_FETCH_TIMEOUT_MS = 8_000;
/** @deprecated Use PRINT_POLL_TIMEOUT_MS / SILENT_PRINT_POST_TIMEOUT_MS */
export const SILENT_PRINT_TIMEOUT_MS = PRINT_POLL_TIMEOUT_MS;
const PRINT_STATUS_POLL_MS = 2_000;

const PRINT_ERR_STILL_PRINTING =
  "Print is taking longer than expected. Check the SELPHY — it may still be printing. If not, retry.";

export const PRINT_ERR_BOOTH_OFFLINE =
  "Booth print window is closed. Keep the Windows booth print window open (SETUP-BOOTH-PC.cmd), then retry.";

const PRINT_ERR_QUEUE_WAITING =
  "Print did not start. Keep the Windows booth print window open (SETUP-BOOTH-PC.cmd), then retry.";

const PRINT_ERR_POST_HANG =
  "Print request did not finish. Keep the Windows booth print window open (SETUP-BOOTH-PC.cmd), then retry.";

export function isPrintStillInProgressError(raw: unknown): boolean {
  const m = raw instanceof Error ? raw.message : String(raw ?? "");
  return /taking longer than expected|may still be printing/i.test(m);
}

const PRINT_ERR_QUEUE_FAILED =
  "Print queue failed — check SELPHY and that the Windows booth PC is powered on.";

type PrintProgress = {
  onAccepted?: () => void;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      credentials: init.credentials ?? "include",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

export function guestPrintError(raw: string): string {
  const m = raw.toLowerCase();
  if (
    /setup-booth-pc|booth print window is closed|print request did not finish|print status did not respond|print did not start/i.test(
      m,
    )
  ) {
    return /print did not start/i.test(m)
      ? PRINT_ERR_QUEUE_WAITING
      : PRINT_ERR_BOOTH_OFFLINE;
  }
  if (
    /taking longer than expected|may still be printing/i.test(m)
  ) {
    return PRINT_ERR_STILL_PRINTING;
  }
  if (
    /did not pick it up|booth worker|npm run booth|npm run dev|booth print service/i.test(
      m,
    )
  ) {
    return PRINT_ERR_BOOTH_OFFLINE;
  }
  if (
    /booth computer network|requires the app server|is the booth server running|win32|failed to fetch|networkerror|load failed|mixed content|blocked:mixed/i.test(
      m,
    )
  ) {
    return "Print needs the Windows booth PC powered on so it can send photos to the SELPHY.";
  }
  if (
    /not reachable|could not reach selphy|selphy not reachable|selphy wi‑?fi|selphy wifi/i.test(
      m,
    )
  ) {
    return "Printer not ready — check SELPHY power and Wi‑Fi (same network as the booth PC). Keep SETUP-BOOTH-PC.cmd open.";
  }
  if (
    /printer not found:|pick a detected printer|no printers detected|print to pdf|onenote/i.test(
      m,
    )
  ) {
    return "Printer not ready — check SELPHY power and Wi‑Fi (same network as the booth PC). Keep SETUP-BOOTH-PC.cmd open.";
  }
  if (/timed out|not ready|offline|work offline|paused/i.test(m)) {
    return "Printer not ready — check power, connection, and paper.";
  }
  if (/photo|too small|empty|could not download|cors/i.test(m)) {
    return "Photo not ready — wait for the transform to finish, then retry.";
  }
  const cut = raw.split(/\s+Available:/i)[0]?.trim() || raw;
  return cut.length > 120 ? `${cut.slice(0, 117)}…` : cut;
}

/**
 * Same-origin `/api/print` only. Stale LAN booth URLs (e.g. 192.168.18.87)
 * are ignored — HTTPS Vercel queues; the Windows worker silent-prints.
 */
export function resolvePrintApiUrl(_boothPrintBaseUrl?: string): string {
  return "/api/print";
}

type PrintQueueLiveness = {
  worker_alive?: boolean;
  queue_busy?: boolean;
  heartbeat_present?: boolean;
  heartbeat_fresh?: boolean;
};

export async function pollQueuedPrintJob(
  jobId: string,
  progress?: PrintProgress,
  initial?: PrintQueueLiveness,
): Promise<void> {
  const started = Date.now();
  const deadline = started + PRINT_POLL_TIMEOUT_MS;
  let accepted = false;
  let lastStatus: string | undefined;
  let workerAlive = initial?.worker_alive;
  let queueBusy = initial?.queue_busy;
  let heartbeatPresent = initial?.heartbeat_present;
  let heartbeatFresh = initial?.heartbeat_fresh;
  let workerGoneSince: number | null = null;
  const markAccepted = () => {
    if (accepted) return;
    accepted = true;
    progress?.onAccepted?.();
  };

  const failIfPendingTooLong = () => {
    if (accepted) return;
    const stillPending =
      lastStatus === "pending" || lastStatus == null || lastStatus === "";
    // Fresh heartbeat OR another job is `printing` → wait for the queue.
    if (
      !stillPending ||
      workerAlive === true ||
      queueBusy === true ||
      heartbeatFresh === true
    ) {
      workerGoneSince = null;
      return;
    }
    // Missing heartbeat is not "window closed" (old booth copy / worker not
    // loaded yet). Only fail fast when a heartbeat existed and went stale.
    const confirmedStale =
      heartbeatPresent === true && heartbeatFresh === false && queueBusy !== true;
    const waitMs = confirmedStale
      ? PRINT_PENDING_NO_WORKER_MS
      : PRINT_PENDING_UNKNOWN_WORKER_MS;
    if (workerGoneSince == null) workerGoneSince = Date.now();
    if (Date.now() - workerGoneSince < waitMs) return;
    throw new Error(
      confirmedStale ? PRINT_ERR_BOOTH_OFFLINE : PRINT_ERR_QUEUE_WAITING,
    );
  };

  while (true) {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `/api/print/status?id=${encodeURIComponent(jobId)}`,
        { credentials: "include", cache: "no-store" },
        PRINT_STATUS_FETCH_TIMEOUT_MS,
      );
    } catch (e) {
      failIfPendingTooLong();
      if (Date.now() >= deadline) {
        throw isAbortError(e)
          ? new Error(PRINT_ERR_BOOTH_OFFLINE)
          : e instanceof Error
            ? e
            : new Error(String(e));
      }
      await sleep(PRINT_STATUS_POLL_MS);
      continue;
    }

    let payload: {
      ok?: boolean;
      status?: string;
      error?: string;
      worker_alive?: boolean;
      queue_busy?: boolean;
      heartbeat_present?: boolean;
      heartbeat_fresh?: boolean;
    } = {};
    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      /* non-JSON */
    }

    if (!res.ok) {
      throw new Error(payload.error || `Print status failed (${res.status})`);
    }

    lastStatus = payload.status;
    if (typeof payload.worker_alive === "boolean") {
      workerAlive = payload.worker_alive;
    }
    if (typeof payload.queue_busy === "boolean") {
      queueBusy = payload.queue_busy;
    }
    if (typeof payload.heartbeat_present === "boolean") {
      heartbeatPresent = payload.heartbeat_present;
    }
    if (typeof payload.heartbeat_fresh === "boolean") {
      heartbeatFresh = payload.heartbeat_fresh;
    }

    if (payload.status === "done") {
      markAccepted();
      return;
    }
    if (payload.status === "printing") {
      markAccepted();
    }
    if (payload.status === "failed") {
      throw new Error(payload.error || PRINT_ERR_QUEUE_FAILED);
    }

    failIfPendingTooLong();

    if (Date.now() >= deadline) {
      // Worker already claimed the job — SELPHY may still be printing.
      // Do not fail the UI (countdown overlay must not be aborted).
      if (accepted) return;
      if (lastStatus === "pending" || lastStatus == null) {
        // Queue is moving (heartbeat or another job printing) — not a closed window.
        if (workerAlive === true || queueBusy === true || heartbeatFresh === true) {
          throw new Error(PRINT_ERR_STILL_PRINTING);
        }
        throw new Error(
          heartbeatPresent === true
            ? PRINT_ERR_BOOTH_OFFLINE
            : PRINT_ERR_QUEUE_WAITING,
        );
      }
      break;
    }
    await sleep(PRINT_STATUS_POLL_MS);
  }

  throw new Error(PRINT_ERR_STILL_PRINTING);
}

type PrintPayload = {
  ok?: boolean;
  error?: string;
  queued?: boolean;
  jobId?: string;
  printer_name?: string;
  worker_alive?: boolean;
  queue_busy?: boolean;
  heartbeat_present?: boolean;
  heartbeat_fresh?: boolean;
};

export async function followPrintPayload(
  payload: PrintPayload,
  progress?: PrintProgress,
): Promise<void> {
  if (payload.queued) {
    const jobId = payload.jobId?.trim();
    if (!jobId) {
      throw new Error("Print was queued but no job id was returned.");
    }
    await pollQueuedPrintJob(jobId, progress, {
      worker_alive: payload.worker_alive,
      queue_busy: payload.queue_busy,
      heartbeat_present: payload.heartbeat_present,
      heartbeat_fresh: payload.heartbeat_fresh,
    });
    return;
  }
  progress?.onAccepted?.();
}

export async function silentPrintApi(
  imageUrl: string,
  printerName: string,
  boothPrintBaseUrl: string,
  progress?: PrintProgress,
): Promise<void> {
  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    SILENT_PRINT_POST_TIMEOUT_MS,
  );
  let payload: PrintPayload = {};
  try {
    const res = await fetch(resolvePrintApiUrl(boothPrintBaseUrl), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl,
        printer_name: printerName,
      }),
      signal: controller.signal,
    });

    try {
      payload = (await res.json()) as PrintPayload;
    } catch {
      /* non-JSON */
    }

    if (!res.ok) {
      throw new Error(
        payload.error ||
          `Print request failed (${res.status}). Is the booth server running on this PC?`,
      );
    }
  } catch (e) {
    if (isAbortError(e)) {
      throw new Error(PRINT_ERR_POST_HANG);
    }
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    window.clearTimeout(timer);
  }

  // Poll is never under the POST AbortController (countdown overlay can run
  // in parallel once the worker claims the job).
  await followPrintPayload(payload, progress);
}

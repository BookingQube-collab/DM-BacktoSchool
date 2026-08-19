/** Guest/admin tablet print — Vercel queues; booth PC worker silent-prints the photo. */

export const SILENT_PRINT_TIMEOUT_MS = 90_000;
const PRINT_STATUS_POLL_MS = 2_000;
/** Fail fast if the booth PC has not claimed the job (heartbeat missing). */
const WORKER_MISS_MS = 12_000;

const PRINT_ERR_BOOTH_OFF =
  "Print queued but booth PC did not pick it up — keep the Windows booth PC powered on.";
const PRINT_ERR_STILL_PRINTING =
  "Print is taking longer than expected. Check the SELPHY — it may still be printing. If not, retry.";
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

export function guestPrintError(raw: string): string {
  const m = raw.toLowerCase();
  if (
    /did not pick it up|booth worker|npm run booth|npm run dev|booth print service/i.test(
      m,
    )
  ) {
    return PRINT_ERR_BOOTH_OFF;
  }
  if (/taking longer than expected|may still be printing/i.test(m)) {
    return raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
  }
  if (
    /booth computer network|requires the app server|is the booth server running|win32|failed to fetch|networkerror|load failed|mixed content|blocked:mixed/i.test(
      m,
    )
  ) {
    return "Print needs the Windows booth PC powered on so it can send photos to the SELPHY.";
  }
  if (/not reachable|could not reach selphy|selphy not reachable|selphy wi‑?fi|selphy wifi/i.test(m)) {
    return "Printer not ready — check SELPHY power and Wi‑Fi (same network as the booth PC).";
  }
  if (/printer not found:|pick a detected printer/i.test(m)) {
    return "Printer name not found — ask staff to set it in Admin → Settings.";
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
 * Avoid mixed content: HTTPS tablet must not fetch http://192.168… booth URL.
 * Use same-origin `/api/print` (Vercel queues; booth worker prints).
 */
export function resolvePrintApiUrl(boothPrintBaseUrl: string): string {
  const base = boothPrintBaseUrl.trim().replace(/\/+$/, "");
  const pageIsHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const boothIsHttp = /^http:\/\//i.test(base);

  if (pageIsHttps && boothIsHttp) {
    return "/api/print";
  }
  return base ? `${base}/api/print` : "/api/print";
}

export async function pollQueuedPrintJob(
  jobId: string,
  progress?: PrintProgress,
): Promise<void> {
  const started = Date.now();
  const deadline = started + SILENT_PRINT_TIMEOUT_MS;
  let accepted = false;
  let lastStatus = "";
  const markAccepted = () => {
    if (accepted) return;
    accepted = true;
    progress?.onAccepted?.();
  };

  while (true) {
    const res = await fetch(
      `/api/print/status?id=${encodeURIComponent(jobId)}`,
    );
    let payload: {
      ok?: boolean;
      status?: string;
      error?: string;
      worker_alive?: boolean;
    } = {};
    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      /* non-JSON */
    }

    if (!res.ok) {
      throw new Error(payload.error || `Print status failed (${res.status})`);
    }

    lastStatus = payload.status || lastStatus;

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
    if (payload.status === "pending" && payload.worker_alive === false) {
      if (Date.now() - started >= WORKER_MISS_MS) {
        throw new Error(PRINT_ERR_BOOTH_OFF);
      }
    }

    if (Date.now() >= deadline) break;
    await sleep(PRINT_STATUS_POLL_MS);
  }

  if (lastStatus === "printing") {
    throw new Error(PRINT_ERR_STILL_PRINTING);
  }
  throw new Error(PRINT_ERR_BOOTH_OFF);
}

type PrintPayload = {
  ok?: boolean;
  error?: string;
  queued?: boolean;
  jobId?: string;
  printer_name?: string;
  worker_alive?: boolean;
};

export async function followPrintPayload(
  payload: PrintPayload,
  progress?: PrintProgress,
): Promise<void> {
  if (payload.queued && payload.jobId) {
    await pollQueuedPrintJob(payload.jobId, progress);
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
    SILENT_PRINT_TIMEOUT_MS,
  );
  try {
    const res = await fetch(resolvePrintApiUrl(boothPrintBaseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl,
        printer_name: printerName,
      }),
      signal: controller.signal,
    });

    let payload: PrintPayload = {};
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

    window.clearTimeout(timer);
    await followPrintPayload(payload, progress);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(PRINT_ERR_STILL_PRINTING);
    }
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    window.clearTimeout(timer);
  }
}

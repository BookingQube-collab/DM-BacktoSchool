/**
 * Tablet print — the browser sends the career postcard image to the SELPHY.
 * Vercel cannot reach the printer on LAN; HTTPS tablets must not enqueue
 * print_jobs or call an HTTP booth PC URL (mixed content).
 */

export const SILENT_PRINT_TIMEOUT_MS = 90_000;
const IMAGE_READY_MS = 20_000;
const FETCH_BLOB_MS = 8_000;
const PRINT_CLEANUP_MS = 90_000;

const PRINT_ERR_PHOTO =
  "Photo not ready — wait for the transform to finish, then retry.";
const PRINT_ERR_LOAD = "Print page did not load. Check the photo, then retry.";
const PRINT_ERR_PRINTER =
  "Printer not ready — check SELPHY power, paper, and that it is on the same Wi‑Fi as this tablet.";

type PrintProgress = {
  onAccepted?: () => void;
  onReady?: () => void;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;");
}

export function guestPrintError(raw: string): string {
  const m = raw.toLowerCase();
  if (
    /photo not ready|too small|empty|could not download|cors|did not load/i.test(
      m,
    )
  ) {
    return PRINT_ERR_PHOTO;
  }
  if (/print page did not load|print failed/i.test(m)) {
    return raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
  }
  if (
    /not reachable|could not reach selphy|selphy wi‑?fi|selphy wifi|offline|work offline|paused|timed out|not ready/i.test(
      m,
    )
  ) {
    return PRINT_ERR_PRINTER;
  }
  if (/printer not found:|pick a detected printer/i.test(m)) {
    return "Printer not listed — on the Android sheet, tap Canon SELPHY CP1500 (same Wi‑Fi as this tablet).";
  }
  const cut = raw.split(/\s+Available:/i)[0]?.trim() || raw;
  return cut.length > 120 ? `${cut.slice(0, 117)}…` : cut;
}

function postcardPrintDocument(src: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title></title>
<style>
@page { size: 148mm 100mm; margin: 0; }
html, body {
  margin: 0;
  padding: 0;
  width: 148mm;
  height: 100mm;
  background: #ffffff;
  overflow: hidden;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
img {
  display: block;
  position: absolute;
  left: 0;
  top: 0;
  width: 148mm;
  height: 100mm;
  max-width: none;
  max-height: none;
  object-fit: cover;
  object-position: center;
  border: 0;
}
</style>
</head>
<body>
<img src="${escapeHtmlAttr(src)}" alt="" />
</body>
</html>`;
}

async function resolvePrintableSrc(
  imageUrl: string,
): Promise<{ src: string; revoke?: () => void }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_BLOB_MS);
  try {
    const res = await fetch(imageUrl, {
      mode: "cors",
      credentials: "omit",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    if (blob.size < 2_048) throw new Error("too small");
    const src = URL.createObjectURL(blob);
    return { src, revoke: () => URL.revokeObjectURL(src) };
  } catch {
    return { src: imageUrl };
  } finally {
    window.clearTimeout(timer);
  }
}

function waitForImage(img: HTMLImageElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(PRINT_ERR_PHOTO));
    }, timeoutMs);
    const done = (ok: boolean) => {
      window.clearTimeout(timer);
      if (ok) resolve();
      else reject(new Error(PRINT_ERR_PHOTO));
    };
    if (img.complete && img.naturalWidth > 0) {
      done(true);
      return;
    }
    img.addEventListener("load", () => done(true), { once: true });
    img.addEventListener("error", () => done(false), { once: true });
  });
}

/**
 * Print only the career postcard raster (imageUrl / blob) from the tablet.
 * Isolated document so Chrome/Android does not print booth UI, QR, or chrome.
 */
export async function printPostcardFromTablet(
  imageUrl: string,
  progress?: PrintProgress,
): Promise<void> {
  const url = imageUrl.trim();
  if (!url) throw new Error(PRINT_ERR_PHOTO);
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Print can only run on the tablet website.");
  }

  const resolved = await resolvePrintableSrc(url);
  const html = postcardPrintDocument(resolved.src);

  const iframe = document.createElement("iframe");
  iframe.className = "tablet-print-frame";
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Print postcard");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:148mm;height:100mm;border:0;opacity:0;pointer-events:none;z-index:-1;";

  const fallbackImg = document.createElement("img");
  fallbackImg.className = "print-photo";
  fallbackImg.alt = "";
  fallbackImg.src = resolved.src;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.documentElement.classList.remove("tablet-print-active");
    iframe.remove();
    fallbackImg.remove();
    resolved.revoke?.();
  };

  document.documentElement.classList.add("tablet-print-active");
  document.body.appendChild(fallbackImg);

  try {
    const iframeReady = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error(PRINT_ERR_LOAD)),
        IMAGE_READY_MS,
      );
      iframe.addEventListener("load", () => {
        if (!iframe.contentDocument?.querySelector("img")) return;
        window.clearTimeout(timer);
        resolve();
      });
    });
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
    await iframeReady;

    const frameDoc = iframe.contentDocument;
    const frameWin = iframe.contentWindow;
    if (!frameDoc || !frameWin) throw new Error(PRINT_ERR_LOAD);

    const img = frameDoc.querySelector("img");
    if (!img) throw new Error(PRINT_ERR_LOAD);
    await waitForImage(img, IMAGE_READY_MS);
    try {
      await img.decode();
    } catch {
      /* decode is optional */
    }
    await sleep(60);

    const markReady = () => {
      progress?.onReady?.();
      progress?.onAccepted?.();
    };

    try {
      frameWin.focus();
      frameWin.print();
    } catch {
      window.print();
    }
    markReady();

    const after = () => cleanup();
    frameWin.addEventListener("afterprint", after, { once: true });
    window.addEventListener("afterprint", after, { once: true });
    window.setTimeout(cleanup, PRINT_CLEANUP_MS);
  } catch (e) {
    cleanup();
    throw e instanceof Error ? e : new Error(String(e));
  }
}

/** HTTPS tablets ignore LAN booth URLs (mixed content). Always same-origin. */
export function resolvePrintApiUrl(_boothPrintBaseUrl: string): string {
  const pageIsHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  if (pageIsHttps) return "/api/print";
  const base = _boothPrintBaseUrl.trim().replace(/\/+$/, "");
  return base ? `${base}/api/print` : "/api/print";
}

/**
 * Legacy Windows booth queue client — unused by HTTPS tablet Print/Reprint.
 * Left for local `npm run booth` IPP if a PC is ever used again.
 */
export async function followPrintPayload(
  payload: { queued?: boolean; jobId?: string },
  progress?: PrintProgress,
): Promise<void> {
  if (payload.queued && payload.jobId) {
    throw new Error(
      "Cloud print queue is not used. Print the photo from this tablet instead.",
    );
  }
  progress?.onReady?.();
  progress?.onAccepted?.();
}

export async function silentPrintApi(
  imageUrl: string,
  _printerName: string,
  _boothPrintBaseUrl: string,
  progress?: PrintProgress,
): Promise<void> {
  await printPostcardFromTablet(imageUrl, progress);
}

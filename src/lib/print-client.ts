/** Guest/admin tablet print — browser prints a full-bleed postcard image. No booth PC. */

export const PRINT_DIALOG_TIMEOUT_MS = 120_000;
const IMAGE_LOAD_TIMEOUT_MS = 20_000;
/** Fast dismiss of the system sheet (back/X) before staff could tap SELPHY. */
const PRINT_CANCEL_MS = 1_800;

const PRINT_ERR_CANCELLED = "Print cancelled — retry";
const PRINT_ERR_PHOTO =
  "Photo not ready — wait for the transform to finish, then retry.";
const PRINT_ERR_GENERIC = "Print failed. Try again.";

type PrintProgress = {
  onAccepted?: () => void;
};

export type BrowserPrintOptions = PrintProgress & {
  mallLogoUrl?: string | null;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function guestPrintError(raw: string): string {
  const m = raw.toLowerCase();
  if (/cancel/i.test(m)) return PRINT_ERR_CANCELLED;
  if (
    /photo not ready|too small|empty|could not load|could not download|cors/i.test(
      m,
    )
  ) {
    return PRINT_ERR_PHOTO;
  }
  if (
    /booth pc|booth worker|npm run booth|windows booth|keep the windows|laptop|mixed content|win32|spooler|ipp\b/i.test(
      m,
    )
  ) {
    return PRINT_ERR_GENERIC;
  }
  const cut = raw.split(/\s+Available:/i)[0]?.trim() || raw;
  return cut.length > 120 ? `${cut.slice(0, 117)}…` : cut;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;");
}

function postcardDocumentHtml(imageUrl: string, mallLogoUrl?: string | null): string {
  const photoSrc = escapeHtmlAttr(imageUrl);
  const logo = mallLogoUrl?.trim()
    ? `<img class="logo" src="${escapeHtmlAttr(mallLogoUrl.trim())}" alt="" />`
    : "";
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Postcard</title>
<style>
  @page {
    size: 148mm 100mm;
    margin: 0;
  }
  html, body {
    margin: 0;
    padding: 0;
    width: 148mm;
    height: 100mm;
    overflow: hidden;
    background: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    position: relative;
    width: 148mm;
    height: 100mm;
    overflow: hidden;
    background: #000;
  }
  img.photo {
    position: absolute;
    inset: 0;
    display: block;
    width: 148mm;
    height: 100mm;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    object-fit: cover;
    object-position: center;
  }
  img.logo {
    position: absolute;
    right: 2.8%;
    bottom: 2.8%;
    width: 12%;
    height: auto;
    max-height: 12%;
    object-fit: contain;
    z-index: 2;
  }
  @media print {
    @page {
      size: 148mm 100mm;
      margin: 0;
    }
    html, body, .sheet {
      width: 148mm !important;
      height: 100mm !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: #000 !important;
    }
    img.photo {
      width: 148mm !important;
      height: 100mm !important;
      object-fit: cover !important;
    }
  }
</style>
</head>
<body>
  <div class="sheet">
    <img class="photo" src="${photoSrc}" alt="">
    ${logo}
  </div>
</body>
</html>`;
}

function waitForDocumentImages(doc: Document, timeoutMs: number): Promise<void> {
  const photo = doc.querySelector<HTMLImageElement>("img.photo");
  if (!photo) {
    throw new Error(PRINT_ERR_PHOTO);
  }

  const waitPhoto = () => {
    if (typeof photo.decode === "function") {
      return photo.decode();
    }
    if (photo.complete && photo.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      photo.addEventListener("load", () => resolve(), { once: true });
      photo.addEventListener(
        "error",
        () => reject(new Error(PRINT_ERR_PHOTO)),
        { once: true },
      );
    });
  };

  const logo = doc.querySelector<HTMLImageElement>("img.logo");
  const waitLogo = logo
    ? (typeof logo.decode === "function"
        ? logo.decode()
        : logo.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              logo.addEventListener("load", () => resolve(), { once: true });
              logo.addEventListener("error", () => resolve(), { once: true });
            })
      ).catch(() => {
        logo.remove();
      })
    : Promise.resolve();

  return Promise.race([
    Promise.all([waitPhoto(), waitLogo]).then(() => undefined),
    sleep(timeoutMs).then(() => {
      throw new Error(PRINT_ERR_PHOTO);
    }),
  ]);
}

function waitForAfterPrint(
  iframeWin: Window,
  ignoreBefore: number,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (Date.now() < ignoreBefore) return;
      if (settled) return;
      settled = true;
      iframeWin.removeEventListener("afterprint", finish);
      window.removeEventListener("afterprint", finish);
      resolve();
    };
    iframeWin.addEventListener("afterprint", finish);
    window.addEventListener("afterprint", finish);
  });
}

function createPrintFrame(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.className = "postcard-print-frame";
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Print postcard");
  Object.assign(iframe.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "148mm",
    height: "100mm",
    border: "0",
    margin: "0",
    padding: "0",
    opacity: "0.01",
    pointerEvents: "none",
    zIndex: "0",
  });
  document.body.appendChild(iframe);
  return iframe;
}

/**
 * Print only the career postcard image (photo + mall logo) via a hidden iframe.
 * HTTPS Vercel cannot IPP to the SELPHY — the tablet browser is the printer path.
 */
export async function printPostcardFromBrowser(
  imageUrl: string,
  options?: BrowserPrintOptions,
): Promise<void> {
  const src = imageUrl?.trim();
  if (!src) throw new Error(PRINT_ERR_PHOTO);

  const iframe = createPrintFrame();
  const doc = iframe.contentDocument;
  const iframeWin = iframe.contentWindow;
  if (!doc || !iframeWin) {
    iframe.remove();
    throw new Error(PRINT_ERR_GENERIC);
  }

  try {
    doc.open();
    doc.write(postcardDocumentHtml(src, options?.mallLogoUrl));
    doc.close();

    await waitForDocumentImages(doc, IMAGE_LOAD_TIMEOUT_MS);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    document.documentElement.classList.add("is-printing-postcard");
    const startedAt = Date.now();
    const afterPrint = waitForAfterPrint(iframeWin, startedAt + 350);
    try {
      iframeWin.focus();
      iframeWin.print();
    } catch {
      throw new Error(PRINT_ERR_GENERIC);
    }

    const blockingMs = Date.now() - startedAt;
    if (blockingMs > 250) {
      if (blockingMs < PRINT_CANCEL_MS) {
        throw new Error(PRINT_ERR_CANCELLED);
      }
    } else {
      const outcome = await Promise.race([
        afterPrint.then(() => "printed" as const),
        sleep(PRINT_DIALOG_TIMEOUT_MS).then(() => "timeout" as const),
      ]);
      if (outcome === "timeout") {
        throw new Error(PRINT_ERR_CANCELLED);
      }
      if (Date.now() - startedAt < PRINT_CANCEL_MS) {
        throw new Error(PRINT_ERR_CANCELLED);
      }
    }

    options?.onAccepted?.();
  } finally {
    document.documentElement.classList.remove("is-printing-postcard");
    iframe.remove();
  }
}

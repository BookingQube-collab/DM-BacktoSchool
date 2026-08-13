// Downscale an image (from a video frame or File) to max 900px on the longest edge
// and return a base64 JPEG string (without data URL prefix stripping applied here).

const MAX_EDGE = 900;

function drawScaled(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
): string {
  const ratio = Math.min(1, MAX_EDGE / Math.max(srcWidth, srcHeight));
  const w = Math.round(srcWidth * ratio);
  const h = Math.round(srcHeight * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.9);
}

// Capture a still from a mirrored <video> element WITHOUT the mirror
// (front cameras look mirrored on screen; the saved photo should not be).
export function captureFromVideo(video: HTMLVideoElement): string {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("Camera not ready");
  return drawScaled(video, w, h);
}

export function fileToDownscaledDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const out = drawScaled(img, img.naturalWidth, img.naturalHeight);
        URL.revokeObjectURL(url);
        resolve(out);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

const LOGO_MAX_EDGE = 1600;
const LOGO_PASSTHROUGH_BYTES = 2 * 1024 * 1024;

function isAlphaFriendlyLogo(file: File) {
  return (
    file.type === "image/png" ||
    file.type === "image/webp" ||
    /\.(png|webp)$/i.test(file.name)
  );
}

/**
 * Read a branding/logo file as a data URL while preserving PNG/WebP alpha.
 * Do not use fileToDownscaledDataUrl for logos — JPEG flattens transparency to black.
 */
export function fileToLogoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const finishOk = (dataUrl: string) => {
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      };
      const finishErr = (err: unknown) => {
        URL.revokeObjectURL(objectUrl);
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      try {
        const maxDim = Math.max(img.naturalWidth, img.naturalHeight);
        if (
          isAlphaFriendlyLogo(file) &&
          maxDim <= LOGO_MAX_EDGE &&
          file.size <= LOGO_PASSTHROUGH_BYTES
        ) {
          const reader = new FileReader();
          reader.onload = () => finishOk(String(reader.result));
          reader.onerror = () => finishErr(new Error("Could not read logo image"));
          reader.readAsDataURL(file);
          return;
        }

        const ratio = Math.min(1, LOGO_MAX_EDGE / Math.max(1, maxDim));
        const w = Math.max(1, Math.round(img.naturalWidth * ratio));
        const h = Math.max(1, Math.round(img.naturalHeight * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) throw new Error("Canvas not supported");
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        // Always PNG so any remaining transparency survives upload.
        finishOk(canvas.toDataURL("image/png"));
      } catch (e) {
        finishErr(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read logo image"));
    };
    img.src = objectUrl;
  });
}

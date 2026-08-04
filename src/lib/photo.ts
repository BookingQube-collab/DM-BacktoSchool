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

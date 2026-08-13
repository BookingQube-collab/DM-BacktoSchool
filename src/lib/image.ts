/** Accept a data URL or raw base64 JPEG/PNG/WebP string. */
export function parseImageDataUrl(
  raw: unknown,
  label = "Image",
): { error?: string; bytes?: Uint8Array; contentType?: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { error: `${label} is required` };
  }
  const value = raw.trim();
  const dataUrlMatch = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(
    value,
  );
  let contentType = "image/jpeg";
  let base64 = value;
  if (dataUrlMatch) {
    contentType = dataUrlMatch[1]
      .toLowerCase()
      .replace("image/jpg", "image/jpeg");
    base64 = dataUrlMatch[2];
  } else if (!/^[A-Za-z0-9+/=\s]+$/.test(value)) {
    return { error: `${label} must be a valid image` };
  }

  try {
    let bytes: Uint8Array;
    if (typeof Buffer !== "undefined") {
      bytes = new Uint8Array(Buffer.from(base64.replace(/\s/g, ""), "base64"));
    } else {
      const binary = atob(base64.replace(/\s/g, ""));
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    }
    if (bytes.length < 32) return { error: `${label} is too small or empty` };
    if (bytes.length > 10 * 1024 * 1024) {
      return { error: `${label} must be under 10MB` };
    }
    return { bytes, contentType };
  } catch {
    return { error: `Could not decode ${label.toLowerCase()}` };
  }
}

/** Derive a readable store name from an image filename. */
export function humanizeFilename(filename: string) {
  const base = filename.replace(/\.[^.]+$/, "");
  return base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

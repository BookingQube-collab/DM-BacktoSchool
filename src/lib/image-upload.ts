import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseImageDataUrl } from "@/lib/image";

export { parseImageDataUrl, humanizeFilename } from "@/lib/image";

function extForContentType(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

async function signPrivatePath(bucket: string, path: string) {
  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  if (signErr || !signed?.signedUrl) {
    return { error: `Signed URL failed: ${signErr?.message ?? "unknown"}` } as const;
  }
  return { path, url: signed.signedUrl } as const;
}

export async function uploadPrivateImage(
  bucket: string,
  prefix: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ path: string; url: string } | { error: string }> {
  const ext = extForContentType(contentType);
  const path = `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: false });

  if (upErr) return { error: `Upload failed: ${upErr.message}` };

  return signPrivatePath(bucket, path);
}

/** Upload (or replace) a file at a fixed storage path. */
export async function uploadPrivateImageAtPath(
  bucket: string,
  pathWithoutExt: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ path: string; url: string } | { error: string }> {
  const ext = extForContentType(contentType);
  const path = `${pathWithoutExt}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: true });

  if (upErr) return { error: `Upload failed: ${upErr.message}` };

  return signPrivatePath(bucket, path);
}

export async function refreshSignedUrl(bucket: string, path: string) {
  return signPrivatePath(bucket, path);
}

export async function parseAndUploadImage(
  bucket: string,
  prefix: string,
  raw: unknown,
  label = "Image",
) {
  const parsed = parseImageDataUrl(raw, label);
  if (parsed.error || !parsed.bytes || !parsed.contentType) {
    return { error: parsed.error || `${label} is required` } as const;
  }
  const uploaded = await uploadPrivateImage(
    bucket,
    prefix,
    parsed.bytes,
    parsed.contentType,
  );
  if ("error" in uploaded) return { error: uploaded.error } as const;
  return { path: uploaded.path, url: uploaded.url } as const;
}

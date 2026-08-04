export type TransformResult = { imageUrl: string };

export async function transformPhoto(
  imageBase64: string,
  prompt: string,
): Promise<TransformResult> {
  const res = await fetch("/api/transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, prompt }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Transform failed (${res.status})`);
  }
  return (await res.json()) as TransformResult;
}

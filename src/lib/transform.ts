export type TransformResult = { imageUrl: string };

export async function transformPhoto(
  imageBase64: string,
  prompt: string,
  profession?: { id: string; title: string },
): Promise<TransformResult> {
  const res = await fetch("/api/transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64,
      prompt,
      professionId: profession?.id,
      professionTitle: profession?.title,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Transform failed (${res.status})`);
  }
  return (await res.json()) as TransformResult;
}

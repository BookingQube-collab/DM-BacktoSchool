import { createFileRoute } from "@tanstack/react-router";

const FREEPIK_BASE =
  "https://api.freepik.com/v1/ai/gemini-2-5-flash-image-preview";

type StartResponse = {
  data?: { task_id?: string; status?: string; generated?: string[] };
};

type PollResponse = {
  data?: {
    status?: string;
    generated?: string[];
  };
};

export const Route = createFileRoute("/api/transform")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const key = process.env.FREEPIK_API_KEY;
          if (!key) {
            return json({ error: "FREEPIK_API_KEY not configured" }, 500);
          }

          const body = (await request.json()) as {
            imageBase64?: string;
            prompt?: string;
          };
          if (!body?.imageBase64 || !body?.prompt) {
            return json({ error: "imageBase64 and prompt are required" }, 400);
          }

          const cleanBase64 = body.imageBase64.replace(
            /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
            "",
          );

          // 1. Kick off the task
          const startRes = await fetch(FREEPIK_BASE, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-freepik-api-key": key,
            },
            body: JSON.stringify({
              prompt: body.prompt,
              reference_images: [cleanBase64],
            }),
          });

          if (!startRes.ok) {
            const text = await startRes.text().catch(() => "");
            return json(
              { error: `Freepik start failed: ${startRes.status} ${text}` },
              502,
            );
          }
          const startData = (await startRes.json()) as StartResponse;
          const taskId = startData.data?.task_id;
          if (!taskId) {
            return json({ error: "No task_id returned from Freepik" }, 502);
          }

          // 2. Poll
          let generatedUrl: string | undefined;
          const deadline = Date.now() + 90_000;
          while (Date.now() < deadline) {
            await sleep(2500);
            const pollRes = await fetch(`${FREEPIK_BASE}/${taskId}`, {
              headers: { "x-freepik-api-key": key },
            });
            if (!pollRes.ok) continue;
            const pollData = (await pollRes.json()) as PollResponse;
            const status = pollData.data?.status;
            const gen = pollData.data?.generated;
            if (status === "FAILED") {
              return json({ error: "Image generation failed" }, 502);
            }
            if (gen && gen.length > 0) {
              generatedUrl = gen[0];
              break;
            }
            if (status === "COMPLETED") {
              generatedUrl = gen?.[0];
              break;
            }
          }

          if (!generatedUrl) {
            return json({ error: "Image generation timed out" }, 504);
          }

          // 3. Fetch bytes and upload to Storage
          const imgRes = await fetch(generatedUrl);
          if (!imgRes.ok) {
            return json({ error: "Could not fetch generated image" }, 502);
          }
          const bytes = new Uint8Array(await imgRes.arrayBuffer());
          const filename = `future-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}.png`;

          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const { error: upErr } = await supabaseAdmin.storage
            .from("future-photos")
            .upload(filename, bytes, {
              contentType: "image/png",
              upsert: false,
            });
          if (upErr) {
            return json(
              { error: `Storage upload failed: ${upErr.message}` },
              502,
            );
          }

          // Bucket is private — issue a long-lived signed URL (1 year).
          const { data: signed, error: signErr } = await supabaseAdmin.storage
            .from("future-photos")
            .createSignedUrl(filename, 60 * 60 * 24 * 365);

          if (signErr || !signed?.signedUrl) {
            return json(
              { error: `Signed URL failed: ${signErr?.message ?? "unknown"}` },
              502,
            );
          }

          return json({ imageUrl: signed.signedUrl });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
    },
  },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { json, requireAdminSession } from "@/lib/admin-auth.server";
import {
  enqueuePrintJob,
  shouldEnqueuePrintForBoothWorker,
} from "@/lib/print-jobs.server";
import {
  fetchPrintableImageBytes,
  printPostcardImageBytes,
  resolvePrinterName,
} from "@/lib/print.server";

async function loadSessionImageBytes(session: {
  image_path: string | null;
  image_url: string;
}): Promise<Buffer> {
  // Prefer private storage path (stable) over signed URL which can expire.
  if (session.image_path?.trim()) {
    const { data, error } = await supabaseAdmin.storage
      .from("future-photos")
      .download(session.image_path.trim());
    if (!error && data) {
      const buf = Buffer.from(await data.arrayBuffer());
      if (buf.length >= 2_048) return buf;
    }
  }

  if (!session.image_url?.trim()) {
    throw new Error("Photo session has no image to reprint");
  }
  return fetchPrintableImageBytes(session.image_url);
}

export const Route = createFileRoute("/api/admin/reprint")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = requireAdminSession(request);
        if (!auth.ok) return auth.response;

        try {
          const body = (await request.json()) as {
            session_id?: string;
            printer_name?: string;
          };

          const sessionId = body?.session_id?.trim();
          if (!sessionId) {
            return json({ error: "session_id is required" }, 400);
          }

          const { data: session, error } = await supabaseAdmin
            .from("photo_sessions")
            .select("id, profession_title, image_url, image_path")
            .eq("id", sessionId)
            .maybeSingle();

          if (error) return json({ error: error.message }, 500);
          if (!session) return json({ error: "Photo session not found" }, 404);

          // Vercel / tablet Admin: queue the stored photo for the booth worker
          // (same silent SELPHY print as guest Print — no Android sheet).
          if (shouldEnqueuePrintForBoothWorker()) {
            let imageUrl = session.image_url?.trim() || "";
            if (session.image_path?.trim()) {
              const signed = await supabaseAdmin.storage
                .from("future-photos")
                .createSignedUrl(session.image_path.trim(), 60 * 60);
              if (signed.data?.signedUrl) imageUrl = signed.data.signedUrl;
            }
            if (!imageUrl) {
              return json({ error: "Photo session has no image to reprint" }, 400);
            }
            const job = await enqueuePrintJob(imageUrl);
            const { isPrintWorkerAlive } = await import("@/lib/settings.server");
            const worker_alive = await isPrintWorkerAlive();
            return json({
              ok: true,
              queued: true,
              jobId: job.id,
              session_id: session.id,
              profession_title: session.profession_title,
              method: "queue",
              worker_alive,
            });
          }

          const bytes = await loadSessionImageBytes(session);
          const printerName = await resolvePrinterName(
            typeof body.printer_name === "string"
              ? body.printer_name
              : undefined,
          );
          const result = await printPostcardImageBytes(bytes, printerName);

          return json({
            ok: true,
            session_id: session.id,
            profession_title: session.profession_title,
            printer_name: result.printer_name,
            spool: result.spool ?? null,
            method: result.method ?? null,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          const status =
            /not found|offline|work offline|paused|requires the app server|win32|no printers detected|0 bytes|empty page|bounds are empty|could not download|not ready|timed out|not accepted|selphy wi‑?fi|wsd|ipp/i.test(
              message,
            )
              ? 503
              : 500;
          return json({ error: message }, status);
        }
      },
    },
  },
});

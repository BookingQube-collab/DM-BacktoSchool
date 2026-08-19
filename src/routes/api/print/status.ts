import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/admin-auth.server";
import { getPrintJob } from "@/lib/print-jobs.server";

export const Route = createFileRoute("/api/print/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const id = url.searchParams.get("id")?.trim() || "";
          if (!id) {
            return json({ error: "id is required" }, 400);
          }

          const job = await getPrintJob(id);
          if (!job) {
            return json({ error: "Print job not found" }, 404);
          }

          const { getSetting } = await import("@/lib/settings.server");
          const beat = (await getSetting("print_worker_heartbeat")).trim();
          const beatMs = beat ? Date.parse(beat) : Number.NaN;
          const worker_alive =
            Number.isFinite(beatMs) && Date.now() - beatMs < 25_000;

          return json({
            ok: true,
            id: job.id,
            status: job.status,
            error: job.error,
            created_at: job.created_at,
            updated_at: job.updated_at,
            worker_alive,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
    },
  },
});

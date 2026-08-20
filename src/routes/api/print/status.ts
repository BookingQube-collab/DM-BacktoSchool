import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/admin-auth.server";
import { getPrintJob } from "@/lib/print-jobs.server";

/** Same-origin Admin/guest poll this; CORS lets a LAN booth page reach Vercel too. */
function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin")?.trim();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  if (origin) headers["Access-Control-Allow-Credentials"] = "true";
  return headers;
}

export const Route = createFileRoute("/api/print/status")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(request),
        });
      },
      GET: async ({ request }) => {
        const cors = corsHeaders(request);
        try {
          const url = new URL(request.url);
          const id = url.searchParams.get("id")?.trim() || "";
          if (!id) {
            return json({ error: "id is required" }, 400, cors);
          }

          const job = await getPrintJob(id);
          if (!job) {
            return json({ error: "Print job not found" }, 404, cors);
          }

          const { getPrintWorkerLiveness } = await import(
            "@/lib/settings.server"
          );
          const liveness = await getPrintWorkerLiveness();

          return json(
            {
              ok: true,
              id: job.id,
              status: job.status,
              error: job.error,
              created_at: job.created_at,
              updated_at: job.updated_at,
              worker_alive: liveness.worker_alive,
              queue_busy: liveness.queue_busy,
              heartbeat_present: liveness.heartbeat_present,
              heartbeat_fresh: liveness.heartbeat_fresh,
            },
            200,
            cors,
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500, cors);
        }
      },
    },
  },
});

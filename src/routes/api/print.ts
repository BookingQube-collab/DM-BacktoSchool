import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/admin-auth.server";
import {
  fetchPrintableImageBytes,
  printPostcardImageBytes,
  printPostcardPng,
  resolvePrinterName,
} from "@/lib/print.server";

/** Allow tablet/Vercel origin to POST print jobs (legacy direct booth path). */
function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin")?.trim();
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function isWindowsBooth(): boolean {
  return typeof process !== "undefined" && process.platform === "win32";
}

export const Route = createFileRoute("/api/print")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(request),
        });
      },
      POST: async ({ request }) => {
        const cors = corsHeaders(request);
        try {
          // Ensure booth worker is polling whenever Windows serves /api/print.
          if (isWindowsBooth()) {
            const { startPrintWorker } = await import(
              "@/lib/print-worker.server"
            );
            startPrintWorker();
          }

          const body = (await request.json()) as {
            imageDataUrl?: string;
            imageUrl?: string;
            printer_name?: string;
          };

          const imageUrl =
            typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
          const imageDataUrl =
            typeof body?.imageDataUrl === "string"
              ? body.imageDataUrl.trim()
              : "";

          if (!imageUrl && !imageDataUrl) {
            return json(
              { error: "imageUrl or imageDataUrl is required" },
              400,
              cors,
            );
          }

          // HTTPS / Vercel cannot IPP to the SELPHY. Guest Print uses the tablet
          // browser (hidden postcard iframe) — do not enqueue print_jobs.
          if (!isWindowsBooth()) {
            return json(
              {
                error:
                  "Print from this tablet. Hard-refresh the page and tap Print.",
              },
              400,
              cors,
            );
          }

          const requested = await resolvePrinterName(
            typeof body.printer_name === "string"
              ? body.printer_name
              : undefined,
          );

          // Prefer the transformed photo URL (booth Print). Data URL kept for
          // legacy clients; both paths composite the Admin mall logo server-side.
          const result = imageUrl
            ? await printPostcardImageBytes(
                await fetchPrintableImageBytes(imageUrl),
                requested,
              )
            : await printPostcardPng(imageDataUrl, requested);

          return json(
            {
              ok: true,
              printer_name: result.printer_name,
              requested_printer_name: requested,
              spool: result.spool ?? null,
              method: result.method ?? null,
            },
            200,
            cors,
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          // 503 = printer/server path unavailable (not a bad client payload)
          const status =
            /not found|offline|work offline|paused|requires the app server|booth computer network|win32|no printers detected|0 bytes|empty page|bounds are empty|photo not ready|not ready|not accepted|ipp|wsd|soft.?driver|timed out|waiting for printer|could not download|not reachable|could not reach/i.test(
              message,
            )
              ? 503
              : 500;
          return json({ error: message }, status, cors);
        }
      },
    },
  },
});

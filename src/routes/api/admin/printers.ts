import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdminSession } from "@/lib/admin-auth.server";
import { listInstalledPrinters } from "@/lib/print.server";

export const Route = createFileRoute("/api/admin/printers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = requireAdminSession(request);
        if (!auth.ok) return auth.response;

        try {
          if (process.platform !== "win32") {
            return json({
              platform: process.platform,
              printers: [],
              hint: "Printer listing only works when the app server runs on Windows.",
            });
          }

          const printers = await listInstalledPrinters();
          const soft = printers.filter((p) => p.softDriver);
          const native = printers.filter((p) => !p.softDriver);
          return json({
            platform: "win32",
            printers,
            hint: !printers.length
              ? "No printers detected. Add Canon SELPHY via USB or Wi‑Fi on this PC (same network). Evolis Primacy 2 is only needed for CR80 card printing."
              : soft.length === printers.length
                ? "Only network/IPP queues found. Wi‑Fi SELPHY can print via direct IPP when reachable — keep Canon SELPHY CP1500 selected. A Canon USB queue is optional."
                : native.length && soft.length
                  ? "USB and network queues found. Use Canon SELPHY for photo prints (Wi‑Fi uses direct IPP). Evolis is for CR80 cards only."
                  : "Copy the exact Windows name into Printer name below. For photo booths keep Canon SELPHY CP1500; Evolis is only for CR80 card reprints.",
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
    },
  },
});

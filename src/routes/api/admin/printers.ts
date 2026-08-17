import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdminPage } from "@/lib/admin-auth.server";
import {
  detectSelphyIppHost,
  listInstalledPrinters,
} from "@/lib/print.server";
import { getSetting } from "@/lib/settings.server";

export const Route = createFileRoute("/api/admin/printers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = requireAdminPage(request, "settings");
        if (!auth.ok) return auth.response;

        try {
          if (process.platform !== "win32") {
            return json({
              platform: process.platform,
              printers: [],
              selphy_ip: null,
              selphy_ipp_url: null,
              printer_host: (await getSetting("printer_host")).trim() || null,
              hint: "Printer listing only works when the app server runs on Windows. Open Admin from the booth PC URL — cloud hosts cannot reach the SELPHY.",
            });
          }

          const printers = await listInstalledPrinters();
          const soft = printers.filter((p) => p.softDriver);
          const native = printers.filter((p) => !p.softDriver);
          const printerName =
            (await getSetting("printer_name")).trim() || "Canon SELPHY CP1500";
          const printerHost = (await getSetting("printer_host")).trim() || null;
          let selphyIp: string | null = null;
          let selphyIppUrl: string | null = null;
          try {
            const detected = await detectSelphyIppHost(printerName);
            selphyIp = detected.ip;
            selphyIppUrl = detected.url;
          } catch {
            /* discovery optional for listing */
          }

          return json({
            platform: "win32",
            printers,
            selphy_ip: selphyIp,
            selphy_ipp_url: selphyIppUrl,
            printer_host: printerHost,
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

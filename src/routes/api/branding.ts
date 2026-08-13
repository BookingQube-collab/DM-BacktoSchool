import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/admin-auth.server";
import { getBrandingSettings } from "@/lib/settings.server";

export const Route = createFileRoute("/api/branding")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const branding = await getBrandingSettings();
          return json(branding);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
    },
  },
});

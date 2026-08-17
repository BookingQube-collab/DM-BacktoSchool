import { createFileRoute } from "@tanstack/react-router";
import { json, requireAdminPage } from "@/lib/admin-auth.server";
import {
  purgeEventActivity,
  verifyAdminPasswordOnly,
} from "@/lib/admin-delete.server";

/**
 * Danger-zone wipe of event activity (guests + photos + storage).
 * Requires an admin session cookie AND the current admin password.
 * Does not delete stores, branding, or app_settings / admin credentials.
 */
export const Route = createFileRoute("/api/admin/purge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = requireAdminPage(request, "settings");
        if (!auth.ok) return auth.response;

        try {
          const body = (await request.json().catch(() => ({}))) as {
            password?: string;
          };
          const password = body.password ?? "";
          if (!password) {
            return json({ error: "Admin password is required" }, 400);
          }

          const ok = await verifyAdminPasswordOnly(password);
          if (!ok) {
            return json({ error: "Incorrect admin password" }, 401);
          }

          const result = await purgeEventActivity();
          return json({
            ok: true,
            message:
              "Deleted all registrations and photos. Stores and settings were kept.",
            ...result,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
    },
  },
});

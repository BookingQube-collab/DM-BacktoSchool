import { createFileRoute } from "@tanstack/react-router";
import {
  clearSessionCookie,
  createSessionCookie,
  json,
  readSessionFromRequest,
} from "@/lib/admin-auth.server";
import {
  getAdminUsername,
  verifyAdminCredentials,
} from "@/lib/settings.server";

export const Route = createFileRoute("/api/admin/auth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readSessionFromRequest(request);
        if (!session) return json({ authenticated: false }, 401);
        return json({
          authenticated: true,
          username: session.sub,
        });
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            username?: string;
            password?: string;
          };
          const username = body.username?.trim() ?? "";
          const password = body.password ?? "";
          if (!username || !password) {
            return json({ error: "Username and password are required" }, 400);
          }

          const ok = await verifyAdminCredentials(username, password);
          if (!ok) return json({ error: "Invalid username or password" }, 401);

          const canonical = await getAdminUsername();
          return json(
            { ok: true, username: canonical },
            200,
            { "Set-Cookie": createSessionCookie(canonical) },
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
      DELETE: async () => {
        return json(
          { ok: true },
          200,
          { "Set-Cookie": clearSessionCookie() },
        );
      },
    },
  },
});

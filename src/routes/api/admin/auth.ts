import { createFileRoute } from "@tanstack/react-router";
import {
  clearSessionCookie,
  createSessionCookie,
  json,
  readSessionFromRequest,
} from "@/lib/admin-auth.server";
import {
  displayNameForRole,
  homePathForPages,
  parseAdminRole,
  type AdminNavKey,
} from "@/lib/admin-roles";
import {
  authenticateAdminUser,
  resolveAdminSessionUser,
} from "@/lib/settings.server";

function pagesChanged(a?: AdminNavKey[], b?: AdminNavKey[]) {
  const left = [...(a ?? [])].sort().join(",");
  const right = [...(b ?? [])].sort().join(",");
  return left !== right;
}

export const Route = createFileRoute("/api/admin/auth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readSessionFromRequest(request);
        if (!session) return json({ authenticated: false }, 401);
        const fallbackRole = parseAdminRole(session.role) ?? "admin";
        const user = await resolveAdminSessionUser(
          session.sub,
          fallbackRole,
          session.pages,
        );
        if (!user) {
          return json(
            { authenticated: false },
            401,
            { "Set-Cookie": clearSessionCookie() },
          );
        }
        const body = {
          authenticated: true,
          username: user.username,
          role: user.role,
          pages: user.pages,
          displayName: displayNameForRole(user.role, user.username),
          home: homePathForPages(user.pages),
        };
        const cookieNeedsUpdate =
          user.role !== fallbackRole ||
          user.username !== session.sub ||
          pagesChanged(session.pages, user.pages);
        if (cookieNeedsUpdate) {
          return json(body, 200, {
            "Set-Cookie": createSessionCookie(
              user.username,
              user.role,
              user.pages,
            ),
          });
        }
        return json(body);
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

          const user = await authenticateAdminUser(username, password);
          if (!user) return json({ error: "Invalid username or password" }, 401);

          return json(
            {
              ok: true,
              username: user.username,
              role: user.role,
              pages: user.pages,
              displayName: displayNameForRole(user.role, user.username),
              home: homePathForPages(user.pages),
            },
            200,
            {
              "Set-Cookie": createSessionCookie(
                user.username,
                user.role,
                user.pages,
              ),
            },
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

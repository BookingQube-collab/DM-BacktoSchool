import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { json, requireAdminSession } from "@/lib/admin-auth.server";
import { parseImageDataUrl, uploadPrivateImageAtPath } from "@/lib/image-upload";
import {
  listPublicSettings,
  setSetting,
  updateAdminPassword,
} from "@/lib/settings.server";

async function uploadMallLogo(raw: unknown) {
  const parsed = parseImageDataUrl(raw, "Doha Mall logo");
  if (parsed.error || !parsed.bytes || !parsed.contentType) {
    return { error: parsed.error || "Doha Mall logo is required" } as const;
  }

  const existingPath = (
    await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "doha_mall_logo_path")
      .maybeSingle()
  ).data?.value?.trim();

  const uploaded = await uploadPrivateImageAtPath(
    "branding",
    "doha-mall-logo",
    parsed.bytes,
    parsed.contentType,
  );
  if ("error" in uploaded) return { error: uploaded.error } as const;

  // Remove previous file when extension changed (different path).
  if (existingPath && existingPath !== uploaded.path) {
    await supabaseAdmin.storage.from("branding").remove([existingPath]);
  }

  await setSetting("doha_mall_logo_path", uploaded.path);
  await setSetting("doha_mall_logo_url", uploaded.url);

  return {
    doha_mall_logo_path: uploaded.path,
    doha_mall_logo_url: uploaded.url,
  } as const;
}

export const Route = createFileRoute("/api/admin/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = requireAdminSession(request);
        if (!auth.ok) return auth.response;
        try {
          const settings = await listPublicSettings();
          return json(settings);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
      PUT: async ({ request }) => {
        const auth = requireAdminSession(request);
        if (!auth.ok) return auth.response;

        try {
          const body = (await request.json()) as {
            freepik_api_key?: string;
            event_name?: string;
            admin_username?: string;
            admin_password?: string;
            printer_name?: string;
            printer_host?: string;
            doha_mall_logo_image?: string;
            clear_doha_mall_logo?: boolean;
          };

          if (typeof body.event_name === "string") {
            await setSetting("event_name", body.event_name.trim());
          }
          if (typeof body.admin_username === "string" && body.admin_username.trim()) {
            await setSetting("admin_username", body.admin_username.trim());
          }
          if (typeof body.freepik_api_key === "string" && body.freepik_api_key.trim()) {
            // Ignore masked placeholder submissions.
            if (!body.freepik_api_key.includes("•")) {
              const cleaned = body.freepik_api_key.replace(/\s+/g, "").trim();
              await setSetting("freepik_api_key", cleaned);
            }
          }
          if (typeof body.admin_password === "string" && body.admin_password.length > 0) {
            if (body.admin_password.length < 6) {
              return json({ error: "Password must be at least 6 characters" }, 400);
            }
            await updateAdminPassword(body.admin_password);
          }
          if (typeof body.printer_name === "string") {
            await setSetting("printer_name", body.printer_name.trim());
          }
          if (typeof body.printer_host === "string") {
            const host = body.printer_host.trim();
            // Allow empty (clear) or a simple IPv4 / hostname.
            if (
              host &&
              !/^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9][a-z0-9._-]{0,62})$/i.test(
                host,
              )
            ) {
              return json(
                {
                  error:
                    "Printer IP must be an IPv4 address (e.g. 192.168.18.108) or leave blank",
                },
                400,
              );
            }
            await setSetting("printer_host", host);
          }

          if (body.clear_doha_mall_logo) {
            const existingPath = (
              await supabaseAdmin
                .from("app_settings")
                .select("value")
                .eq("key", "doha_mall_logo_path")
                .maybeSingle()
            ).data?.value?.trim();
            if (existingPath) {
              await supabaseAdmin.storage.from("branding").remove([existingPath]);
            }
            await setSetting("doha_mall_logo_path", "");
            await setSetting("doha_mall_logo_url", "");
          } else if (body.doha_mall_logo_image) {
            const logo = await uploadMallLogo(body.doha_mall_logo_image);
            if ("error" in logo) return json({ error: logo.error }, 502);
          }

          const settings = await listPublicSettings();
          return json({ ok: true, settings });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
    },
  },
});

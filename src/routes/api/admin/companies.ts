import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { json, requireAdminSession } from "@/lib/admin-auth.server";
import { deleteAllCompanies } from "@/lib/admin-delete.server";
import { parseImageDataUrl, uploadPrivateImage } from "@/lib/image-upload";

function normalizeStoreName(name: string) {
  return name.trim().toLowerCase();
}

async function findStoreByName(name: string, excludeId?: string) {
  const key = normalizeStoreName(name);
  if (!key) return null;

  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, name");
  if (error) throw new Error(error.message);

  return (
    (data ?? []).find(
      (row) =>
        normalizeStoreName(row.name) === key &&
        (!excludeId || row.id !== excludeId),
    ) ?? null
  );
}

async function uploadLogo(raw: unknown) {
  const parsed = parseImageDataUrl(raw, "Store image");
  if (parsed.error || !parsed.bytes || !parsed.contentType) {
    return { error: parsed.error || "Store image is required" } as const;
  }
  const uploaded = await uploadPrivateImage(
    "store-logos",
    "logo",
    parsed.bytes,
    parsed.contentType,
  );
  if ("error" in uploaded) return { error: uploaded.error } as const;
  return {
    logo_path: uploaded.path,
    logo_url: uploaded.url,
  } as const;
}

export const Route = createFileRoute("/api/admin/companies")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = requireAdminSession(request);
        if (!auth.ok) return auth.response;

        const { data, error } = await supabaseAdmin
          .from("companies")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        if (error) return json({ error: error.message }, 500);
        return json({ companies: data ?? [] });
      },
      POST: async ({ request }) => {
        const auth = requireAdminSession(request);
        if (!auth.ok) return auth.response;

        try {
          const body = (await request.json()) as {
            name?: string;
            is_active?: boolean;
            sort_order?: number;
            logo_image?: string;
            stores?: Array<{
              name?: string;
              logo_image?: string;
              is_active?: boolean;
              sort_order?: number;
            }>;
          };

          // Bulk create: [{ name, logo_image }, ...]
          if (Array.isArray(body.stores)) {
            if (!body.stores.length) {
              return json({ error: "No stores to create" }, 400);
            }
            const created = [];
            const seen = new Set<string>();
            for (const item of body.stores) {
              const name = item.name?.trim() ?? "";
              if (!name) {
                return json({ error: "Each store needs a name" }, 400);
              }
              const key = normalizeStoreName(name);
              if (seen.has(key)) {
                return json(
                  { error: `Duplicate store name in upload: ${name}` },
                  400,
                );
              }
              seen.add(key);

              const existing = await findStoreByName(name);
              if (existing) {
                return json(
                  { error: `Store already exists: ${existing.name}` },
                  409,
                );
              }
              if (!item.logo_image) {
                return json(
                  { error: `Store image is required for ${name}` },
                  400,
                );
              }
              const logo = await uploadLogo(item.logo_image);
              if ("error" in logo) return json({ error: logo.error }, 502);

              const { data, error } = await supabaseAdmin
                .from("companies")
                .insert({
                  name,
                  is_active: item.is_active ?? true,
                  sort_order: item.sort_order ?? 0,
                  logo_path: logo.logo_path,
                  logo_url: logo.logo_url,
                })
                .select("*")
                .single();

              if (error) return json({ error: error.message }, 500);
              created.push(data);
            }
            return json({ companies: created }, 201);
          }

          const name = body.name?.trim() ?? "";
          if (!name) return json({ error: "Company name is required" }, 400);

          const existing = await findStoreByName(name);
          if (existing) {
            return json({ error: `Store already exists: ${existing.name}` }, 409);
          }

          let logo_path: string | null = null;
          let logo_url: string | null = null;
          if (body.logo_image) {
            const logo = await uploadLogo(body.logo_image);
            if ("error" in logo) return json({ error: logo.error }, 502);
            logo_path = logo.logo_path;
            logo_url = logo.logo_url;
          }

          const { data, error } = await supabaseAdmin
            .from("companies")
            .insert({
              name,
              is_active: body.is_active ?? true,
              sort_order: body.sort_order ?? 0,
              logo_path,
              logo_url,
            })
            .select("*")
            .single();

          if (error) return json({ error: error.message }, 500);
          return json({ company: data }, 201);
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
            id?: string;
            name?: string;
            is_active?: boolean;
            sort_order?: number;
            logo_image?: string;
          };
          if (!body.id) return json({ error: "id is required" }, 400);

          const patch: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (typeof body.name === "string") {
            const nextName = body.name.trim();
            if (!nextName) return json({ error: "Store name is required" }, 400);
            const existing = await findStoreByName(nextName, body.id);
            if (existing) {
              return json(
                { error: `Store already exists: ${existing.name}` },
                409,
              );
            }
            patch.name = nextName;
          }
          if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
          if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;

          if (body.logo_image) {
            const existing = await supabaseAdmin
              .from("companies")
              .select("logo_path")
              .eq("id", body.id)
              .maybeSingle();

            const logo = await uploadLogo(body.logo_image);
            if ("error" in logo) return json({ error: logo.error }, 502);
            patch.logo_path = logo.logo_path;
            patch.logo_url = logo.logo_url;

            const oldPath = existing.data?.logo_path;
            if (oldPath) {
              await supabaseAdmin.storage.from("store-logos").remove([oldPath]);
            }
          }

          const { data, error } = await supabaseAdmin
            .from("companies")
            .update(patch)
            .eq("id", body.id)
            .select("*")
            .single();

          if (error) return json({ error: error.message }, 500);
          return json({ company: data });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
      DELETE: async ({ request }) => {
        const auth = requireAdminSession(request);
        if (!auth.ok) return auth.response;

        try {
          const url = new URL(request.url);
          const scope = url.searchParams.get("scope");
          if (scope === "all") {
            const result = await deleteAllCompanies();
            return json({ ok: true, ...result });
          }

          const id = url.searchParams.get("id");
          if (!id) return json({ error: "id or scope=all is required" }, 400);

          const { data: existing } = await supabaseAdmin
            .from("companies")
            .select("logo_path")
            .eq("id", id)
            .maybeSingle();

          const { error } = await supabaseAdmin
            .from("companies")
            .delete()
            .eq("id", id);
          if (error) return json({ error: error.message }, 500);

          if (existing?.logo_path) {
            await supabaseAdmin.storage
              .from("store-logos")
              .remove([existing.logo_path]);
          }
          return json({ ok: true, deleted: 1 });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
    },
  },
});

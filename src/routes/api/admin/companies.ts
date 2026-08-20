import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { json, requireAdminSession } from "@/lib/admin-auth.server";
import { deleteAllCompanies } from "@/lib/admin-delete.server";
import { parseImageDataUrl, uploadPrivateImage } from "@/lib/image-upload";
import {
  parseStoreCsv,
  STORE_CSV_MAX_ROWS,
  STORE_LOGO_URL_MAX,
  STORE_NAME_MAX,
  isValidHttpUrl,
  type ParsedStoreRow,
  type StoreCsvRowError,
} from "@/lib/store-csv";

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

function csvFileError(code: "empty_file" | "no_name_column" | "too_many_rows") {
  if (code === "no_name_column") {
    return "CSV must include a name column (see the sample file)";
  }
  if (code === "too_many_rows") {
    return `Too many rows (max ${STORE_CSV_MAX_ROWS})`;
  }
  return "The file has no store rows";
}

async function createStoresFromRows(
  rows: ParsedStoreRow[],
  initialErrors: StoreCsvRowError[],
) {
  const errors: StoreCsvRowError[] = [...initialErrors];
  const created: Record<string, unknown>[] = [];

  const { data: existingRows, error: existingErr } = await supabaseAdmin
    .from("companies")
    .select("name");
  if (existingErr) throw new Error(existingErr.message);

  const existing = new Set(
    (existingRows ?? []).map((r) => normalizeStoreName(r.name)),
  );

  for (const item of rows) {
    if (item.name.length > STORE_NAME_MAX) {
      errors.push({ row: item.row, name: item.name, code: "name_too_long" });
      continue;
    }
    const key = normalizeStoreName(item.name);
    if (existing.has(key)) {
      errors.push({ row: item.row, name: item.name, code: "already_exists" });
      continue;
    }

    let logo_path: string | null = null;
    let logo_url: string | null = null;
    if (item.logo_url) {
      if (
        !isValidHttpUrl(item.logo_url) ||
        item.logo_url.length > STORE_LOGO_URL_MAX
      ) {
        errors.push({
          row: item.row,
          name: item.name,
          code: "invalid_logo_url",
        });
        continue;
      }
      logo_url = item.logo_url;
    }

    const { data, error } = await supabaseAdmin
      .from("companies")
      .insert({
        name: item.name,
        is_active: true,
        sort_order: 0,
        logo_path,
        logo_url,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        errors.push({ row: item.row, name: item.name, code: "already_exists" });
        existing.add(key);
        continue;
      }
      throw new Error(error.message);
    }
    existing.add(key);
    created.push(data);
  }

  return {
    companies: created,
    created_count: created.length,
    errors,
  };
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
            csv?: string;
            stores?: Array<{
              name?: string;
              logo_image?: string;
              logo_url?: string;
              is_active?: boolean;
              sort_order?: number;
            }>;
          };

          // CSV bulk create (name required, logo_url optional)
          if (typeof body.csv === "string") {
            const parsed = parseStoreCsv(body.csv);
            if (!parsed.ok) {
              return json(
                {
                  error: csvFileError(parsed.code),
                  code: parsed.code,
                  max: STORE_CSV_MAX_ROWS,
                },
                400,
              );
            }
            const result = await createStoresFromRows(parsed.rows, parsed.errors);
            const status = result.companies.length > 0 ? 201 : 400;
            return json(result, status);
          }

          // Bulk create: [{ name, logo_image?, logo_url? }, ...]
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

              let logo_path: string | null = null;
              let logo_url: string | null = null;
              if (item.logo_image) {
                const logo = await uploadLogo(item.logo_image);
                if ("error" in logo) return json({ error: logo.error }, 502);
                logo_path = logo.logo_path;
                logo_url = logo.logo_url;
              } else if (item.logo_url?.trim()) {
                const url = item.logo_url.trim();
                if (!isValidHttpUrl(url) || url.length > STORE_LOGO_URL_MAX) {
                  return json(
                    { error: `Invalid logo URL for ${name}` },
                    400,
                  );
                }
                logo_url = url;
              }

              const { data, error } = await supabaseAdmin
                .from("companies")
                .insert({
                  name,
                  is_active: item.is_active ?? true,
                  sort_order: item.sort_order ?? 0,
                  logo_path,
                  logo_url,
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

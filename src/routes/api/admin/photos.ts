import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { json, requireAdminSession } from "@/lib/admin-auth.server";
import {
  deletePhotoSessionById,
  deletePhotoSessionsFiltered,
} from "@/lib/admin-delete.server";
import {
  aggregateByDay,
  aggregateNamedCounts,
  boothDateKey,
  fillDayRange,
} from "@/lib/admin-charts";
import { todayISODate } from "@/lib/registration";

function parseDateParam(value: string | null, fallback: string) {
  if (!value) return fallback;
  return Number.isNaN(Date.parse(value)) ? fallback : value;
}

function dayStartIso(date: string) {
  // Doha Mall local day (UTC+3)
  return `${date}T00:00:00.000+03:00`;
}

function dayEndIso(date: string) {
  return `${date}T23:59:59.999+03:00`;
}

export const Route = createFileRoute("/api/admin/photos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = requireAdminSession(request);
        if (!auth.ok) return auth.response;

        try {
          const url = new URL(request.url);
          const today = todayISODate();
          const from = parseDateParam(url.searchParams.get("from"), today);
          const to = parseDateParam(url.searchParams.get("to"), today);

          const [listResult, aggResult] = await Promise.all([
            supabaseAdmin
              .from("photo_sessions")
              .select(
                "id, profession_id, profession_title, image_url, image_path, created_at, guest_id",
              )
              .gte("created_at", dayStartIso(from))
              .lte("created_at", dayEndIso(to))
              .order("created_at", { ascending: false })
              .limit(200),
            supabaseAdmin
              .from("photo_sessions")
              .select("profession_title, created_at")
              .gte("created_at", dayStartIso(from))
              .lte("created_at", dayEndIso(to)),
          ]);

          if (listResult.error) return json({ error: listResult.error.message }, 500);
          if (aggResult.error) return json({ error: aggResult.error.message }, 500);

          const aggRows = aggResult.data ?? [];
          const by_profession = aggregateNamedCounts(
            aggRows.map((r) => r.profession_title),
          );
          const by_day = fillDayRange(
            from,
            to,
            aggregateByDay(
              aggRows.map((r) => boothDateKey(String(r.created_at))),
            ),
          );

          return json({
            from,
            to,
            total_in_range: aggRows.length,
            photos: (listResult.data ?? []).map((row) => ({
              id: row.id,
              profession_id: row.profession_id,
              profession_title: row.profession_title,
              image_url: row.image_url,
              image_path: row.image_path,
              guest_id: row.guest_id,
              created_at: row.created_at,
            })),
            aggregates: {
              by_profession,
              by_day,
            },
          });
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
          const id = url.searchParams.get("id");
          const scope = url.searchParams.get("scope"); // "filter" | "all"

          if (id) {
            const result = await deletePhotoSessionById(id);
            if (!result.deleted) {
              return json({ error: "Photo not found" }, 404);
            }
            return json({ ok: true, ...result });
          }

          if (scope === "all") {
            const result = await deletePhotoSessionsFiltered({ all: true });
            return json({ ok: true, ...result });
          }

          if (scope === "filter") {
            const today = todayISODate();
            const from = parseDateParam(url.searchParams.get("from"), today);
            const to = parseDateParam(url.searchParams.get("to"), today);
            const result = await deletePhotoSessionsFiltered({
              from,
              to,
              dayStartIso,
              dayEndIso,
            });
            return json({ ok: true, from, to, ...result });
          }

          return json(
            { error: "Provide id, or scope=filter / scope=all" },
            400,
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
    },
  },
});

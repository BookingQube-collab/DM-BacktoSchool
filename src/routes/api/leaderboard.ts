import { createFileRoute } from "@tanstack/react-router";
import { PROFESSIONS, type ProfessionId } from "@/lib/professions";
import { mergeProfessionCounts } from "@/lib/leaderboard";

export const Route = createFileRoute("/api/leaderboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const professionId = url.searchParams.get("professionId")?.trim();

          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const { data, error } = await supabaseAdmin
            .from("photo_sessions")
            .select("profession_id, profession_title, image_url, created_at")
            .order("created_at", { ascending: false });

          if (error) {
            return json({ error: error.message }, 500);
          }

          const sessions = data ?? [];
          const counts = new Map<string, number>();
          const thumbs = new Map<string, string[]>();

          for (const row of sessions) {
            const id = row.profession_id;
            counts.set(id, (counts.get(id) ?? 0) + 1);
            if (row.image_url) {
              const list = thumbs.get(id) ?? [];
              if (list.length < 3) {
                list.push(row.image_url);
                thumbs.set(id, list);
              }
            }
          }

          const professions = mergeProfessionCounts(counts, thumbs);

          // Append orphan profession_ids from DB that aren't in PROFESSIONS.
          const known = new Set(professions.map((p) => p.id));
          for (const [id, count] of counts) {
            if (known.has(id as ProfessionId)) continue;
            const sample = sessions.find((s) => s.profession_id === id);
            professions.push({
              id: id as ProfessionId,
              title: sample?.profession_title ?? id,
              emoji: "⭐",
              count,
              rank: 0,
              latestThumbnails: thumbs.get(id) ?? [],
            });
          }

          if (professions.length > PROFESSIONS.length) {
            professions.sort((a, b) => {
              if (b.count !== a.count) return b.count - a.count;
              return a.title.localeCompare(b.title);
            });
            let rank = 0;
            let prev = Number.NaN;
            for (let i = 0; i < professions.length; i++) {
              if (professions[i].count !== prev) {
                rank = i + 1;
                prev = professions[i].count;
              }
              professions[i].rank = rank;
            }
          }

          const totalPhotos = sessions.length;
          const highlight = professionId
            ? (professions.find((p) => p.id === professionId) ?? null)
            : null;

          return json({ totalPhotos, professions, highlight });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return json({ error: message }, 500);
        }
      },
    },
  },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

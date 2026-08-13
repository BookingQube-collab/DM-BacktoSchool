import { PROFESSIONS, type ProfessionId } from "@/lib/professions";

export type LeaderboardProfession = {
  id: ProfessionId;
  title: string;
  emoji: string;
  count: number;
  rank: number;
  latestThumbnails: string[];
};

export type LeaderboardResponse = {
  totalPhotos: number;
  professions: LeaderboardProfession[];
  highlight?: LeaderboardProfession | null;
};

export async function fetchLeaderboard(
  professionId?: string,
): Promise<LeaderboardResponse> {
  const qs = professionId
    ? `?professionId=${encodeURIComponent(professionId)}`
    : "";
  const res = await fetch(`/api/leaderboard${qs}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Leaderboard failed (${res.status})`);
  }
  return (await res.json()) as LeaderboardResponse;
}

/** Ensure every known profession appears, even with zero photos. */
export function mergeProfessionCounts(
  counts: Map<string, number>,
  thumbs: Map<string, string[]>,
): LeaderboardProfession[] {
  const rows = PROFESSIONS.map((p) => ({
    id: p.id,
    title: p.title,
    emoji: p.emoji,
    count: counts.get(p.id) ?? 0,
    latestThumbnails: thumbs.get(p.id) ?? [],
    rank: 0,
  }));

  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.title.localeCompare(b.title);
  });

  let rank = 0;
  let prevCount = Number.NaN;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].count !== prevCount) {
      rank = i + 1;
      prevCount = rows[i].count;
    }
    rows[i].rank = rank;
  }

  return rows;
}

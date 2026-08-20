import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LeaderboardBoard } from "@/components/LeaderboardBoard";

const searchSchema = z.object({
  highlight: z.string().optional(),
});

export const Route = createFileRoute("/leaderboard")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Career Leaderboard — Smart Start" },
      {
        name: "description",
        content: "Live career leaderboard for the Smart Start Future Me photo booth.",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
      },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { highlight } = Route.useSearch();
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">("vertical");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/branding");
        if (!res.ok) return;
        const data = (await res.json()) as {
          leaderboard_orientation?: string;
        };
        if (cancelled) return;
        setOrientation(data.leaderboard_orientation === "horizontal" ? "horizontal" : "vertical");
      } catch {
        /* keep default vertical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 flex h-[100dvh] w-screen flex-col overflow-hidden bg-background px-[3.5vw] py-[2.2vh]">
      <LeaderboardBoard
        variant="tv"
        orientation={orientation}
        highlightId={highlight}
        autoRefreshMs={12_000}
      />
    </div>
  );
}

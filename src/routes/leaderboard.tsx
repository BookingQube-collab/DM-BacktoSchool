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
        content:
          "Live career leaderboard for the Smart Start Future Me photo booth.",
      },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
      },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { highlight } = Route.useSearch();

  return (
    <div className="fixed inset-0 flex h-[100dvh] w-screen flex-col overflow-hidden bg-background px-[3.5vw] py-[2.2vh]">
      <LeaderboardBoard
        variant="tv"
        highlightId={highlight}
        autoRefreshMs={12_000}
      />
    </div>
  );
}

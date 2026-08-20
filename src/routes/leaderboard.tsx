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

function useViewportIsLandscape() {
  const [isLandscape, setIsLandscape] = useState(true);

  useEffect(() => {
    const update = () => {
      setIsLandscape(window.innerWidth >= window.innerHeight);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return isLandscape;
}

function LeaderboardPage() {
  const { highlight } = Route.useSearch();
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">(
    "vertical",
  );
  const [rotate, setRotate] = useState<0 | 180>(0);
  const viewportLandscape = useViewportIsLandscape();
  const wantsLandscape = orientation === "horizontal";
  const rotated = wantsLandscape !== viewportLandscape;
  const flipped = rotate === 180;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/branding");
        if (!res.ok) return;
        const data = (await res.json()) as {
          leaderboard_orientation?: string;
          leaderboard_rotate?: number | string;
        };
        if (cancelled) return;
        setOrientation(
          data.leaderboard_orientation === "horizontal"
            ? "horizontal"
            : "vertical",
        );
        setRotate(
          data.leaderboard_rotate === 180 || data.leaderboard_rotate === "180"
            ? 180
            : 0,
        );
      } catch {
        /* keep default vertical / unflipped */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="leaderboard-stage"
      data-flip={flipped ? "true" : "false"}
    >
      <div
        className="leaderboard-canvas"
        data-orientation={orientation}
        data-rotated={rotated ? "true" : "false"}
      >
        <LeaderboardBoard
          variant="tv"
          orientation={orientation}
          highlightId={highlight}
          autoRefreshMs={12_000}
        />
      </div>
    </div>
  );
}

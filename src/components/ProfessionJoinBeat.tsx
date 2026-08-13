import { useEffect, useState } from "react";
import type { Profession } from "@/lib/professions";
import { fetchLeaderboard } from "@/lib/leaderboard";
import { professionEmojiFlairClass } from "@/lib/profession-flair";
import { useCountUp } from "@/lib/use-count-up";

type Props = {
  profession: Profession;
  onDone: () => void;
};

/**
 * Brief animated beat after a successful photo: "You joined X as Pilot"
 * with a count-up of that profession's total (+1 already persisted).
 */
export function ProfessionJoinBeat({ profession, onDone }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchLeaderboard(profession.id);
        if (cancelled) return;
        setCount(data.highlight?.count ?? 1);
        setTotal(data.totalPhotos);
      } catch {
        if (cancelled) return;
        setCount(1);
        setTotal(1);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profession.id]);

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(onDone, 3800);
    return () => window.clearTimeout(t);
  }, [ready, onDone]);

  const displayCount = useCountUp(count ?? 0, {
    from: Math.max(0, (count ?? 1) - 1),
    durationMs: 1400,
    enabled: ready && count !== null,
  });
  const displayTotal = useCountUp(total ?? 0, {
    from: Math.max(0, (total ?? 1) - 1),
    durationMs: 1600,
    enabled: ready && total !== null,
  });

  return (
    <div
      role="dialog"
      aria-label="Joined the leaderboard"
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      onClick={onDone}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") onDone();
      }}
    >
      <div className="absolute inset-0 bg-[#120a2e]/85 backdrop-blur-md leaderboard-fade-in motion-reduce:animate-none" />

      <div className="relative z-10 flex max-w-lg flex-col items-center text-center leaderboard-pop-in motion-reduce:animate-none">
        <p className="font-display text-sm uppercase tracking-[0.35em] text-accent">
          You joined the crew
        </p>

        <div className="mt-6 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-accent/30 ring-2 ring-accent/50 leaderboard-pulse motion-reduce:animate-none">
          <span
            className={`text-6xl ${professionEmojiFlairClass(profession.id)} motion-reduce:animate-none`}
            aria-hidden
          >
            {profession.emoji}
          </span>
        </div>

        <h2 className="mt-6 font-display text-3xl font-bold text-foreground md:text-4xl">
          Future {profession.title}
        </h2>

        <p className="mt-3 text-lg text-foreground/75">
          {ready ? (
            <>
              You&apos;re one of{" "}
              <span className="font-display text-3xl font-bold text-accent tabular-nums">
                {displayCount}
              </span>{" "}
              {profession.title.toLowerCase()}
              {displayCount === 1 ? "" : "s"}
            </>
          ) : (
            <span className="text-foreground/50">Counting…</span>
          )}
        </p>

        {ready && total !== null && (
          <p className="mt-2 text-sm text-foreground/55">
            <span className="font-display text-xl font-semibold text-foreground tabular-nums">
              {displayTotal}
            </span>{" "}
            future selves so far
          </p>
        )}

        <p className="mt-10 text-xs uppercase tracking-widest text-foreground/40">
          Tap to continue
        </p>
      </div>
    </div>
  );
}

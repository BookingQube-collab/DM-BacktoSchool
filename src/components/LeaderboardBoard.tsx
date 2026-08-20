import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PROFESSIONS, type Profession, type ProfessionId } from "@/lib/professions";
import {
  fetchLeaderboard,
  type LeaderboardProfession,
  type LeaderboardResponse,
} from "@/lib/leaderboard";
import { professionEmojiFlairClass } from "@/lib/profession-flair";
import { useCountUp } from "@/lib/use-count-up";
import { professionTitleById } from "@/lib/professions";
import { useI18n } from "@/lib/i18n";
import { CareerReaction } from "./CareerReaction";

/** Reflect / glow plays first; count-up starts after this. */
const BUMP_COUNT_DELAY_MS = 480;
const BUMP_CELEBRATE_MS = 1450;

function professionById(id: string): Profession | null {
  return PROFESSIONS.find((p) => p.id === id) ?? null;
}

/** Prefer highlight match first; keep remaining order stable. */
function orderIncreasedForReactions(
  increased: string[],
  highlightId?: ProfessionId | string | null,
): ProfessionId[] {
  const ids = increased.filter((id): id is ProfessionId => PROFESSIONS.some((p) => p.id === id));
  if (!highlightId) return ids;
  const hi = String(highlightId);
  return [...ids.filter((id) => id === hi), ...ids.filter((id) => id !== hi)];
}

type Props = {
  highlightId?: ProfessionId | string | null;
  autoRefreshMs?: number;
  /** Full-screen portrait TV / kiosk layout */
  variant?: "default" | "tv";
  /** Vertical stack (default) or multi-column horizontal grid */
  orientation?: "vertical" | "horizontal";
};

export function LeaderboardBoard({
  highlightId,
  autoRefreshMs = 12_000,
  variant = "default",
  orientation = "vertical",
}: Props) {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Increments per profession when its count rises between polls. */
  const [bumpTokens, setBumpTokens] = useState<Record<string, number>>({});
  /** Full-screen CareerReaction currently playing (one at a time). */
  const [activeReaction, setActiveReaction] = useState<Profession | null>(null);
  const [reactionKey, setReactionKey] = useState(0);
  const prevCountsRef = useRef<Map<string, number>>(new Map());
  const reactionQueueRef = useRef<ProfessionId[]>([]);
  const reactionPlayingRef = useRef(false);
  const isTv = variant === "tv";
  const isHorizontal = orientation === "horizontal";
  const { t, locale } = useI18n();

  const playNextReaction = () => {
    while (reactionQueueRef.current.length > 0) {
      const id = reactionQueueRef.current.shift()!;
      const career = professionById(id);
      if (!career) continue;
      reactionPlayingRef.current = true;
      setActiveReaction(career);
      setReactionKey((k) => k + 1);
      return;
    }
    reactionPlayingRef.current = false;
    setActiveReaction(null);
  };

  const enqueueReactions = (increased: string[]) => {
    const ordered = orderIncreasedForReactions(increased, highlightId);
    if (ordered.length === 0) return;
    reactionQueueRef.current.push(...ordered);
    if (!reactionPlayingRef.current) {
      playNextReaction();
    }
  };

  useEffect(() => {
    let cancelled = false;

    const applyLeaderboard = (next: LeaderboardResponse) => {
      const prev = prevCountsRef.current;
      const seenBefore = prev.size > 0;
      const increased: string[] = [];

      for (const row of next.professions) {
        const prior = prev.get(row.id);
        if (seenBefore && prior !== undefined && row.count > prior) {
          increased.push(row.id);
        }
        prev.set(row.id, row.count);
      }

      setData(next);
      setError(null);

      if (increased.length === 0) return;
      setBumpTokens((tokens) => {
        const nextTokens = { ...tokens };
        for (const id of increased) {
          nextTokens[id] = (nextTokens[id] ?? 0) + 1;
        }
        return nextTokens;
      });
      enqueueReactions(increased);
    };

    const load = async () => {
      try {
        const next = await fetchLeaderboard(highlightId ? String(highlightId) : undefined);
        if (!cancelled) applyLeaderboard(next);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t("lbLoadError"));
        }
      }
    };

    void load();
    if (autoRefreshMs <= 0) {
      return () => {
        cancelled = true;
      };
    }

    const id = window.setInterval(() => void load(), autoRefreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [highlightId, autoRefreshMs]);

  const total = useCountUp(data?.totalPhotos ?? 0, {
    durationMs: 1100,
    enabled: !!data,
  });

  const maxCount = Math.max(1, ...(data?.professions.map((p) => p.count) ?? [1]));

  return (
    <div className={isTv ? "flex h-full min-h-0 w-full flex-col" : "mx-auto w-full max-w-4xl"}>
      {activeReaction && (
        <CareerReaction key={reactionKey} career={activeReaction} onComplete={playNextReaction} />
      )}
      <div className={`shrink-0 text-center ${isTv ? "px-2" : ""}`}>
        {isTv && (
          <h1 className="mx-auto flex max-w-[42vmin] justify-center">
            <img
              src="/smart-start-logo.png"
              alt="Smart Start"
              className="h-auto w-full max-h-[11vh] object-contain drop-shadow-lg"
            />
          </h1>
        )}
        <p
          className={`font-display uppercase tracking-[0.35em] text-accent ${
            isTv ? "mt-3 text-[clamp(0.7rem,1.4vh,1rem)]" : "text-sm"
          }`}
        >
          {t("lbTitle")}
        </p>
        <h2
          className={`mt-2 font-display font-bold text-foreground ${
            isTv ? "text-[clamp(1.6rem,3.6vh,3.25rem)] leading-tight" : "text-4xl md:text-5xl"
          }`}
        >
          {t("lbHeadline")}
        </h2>
        <p
          className={`mt-2 text-foreground/70 ${isTv ? "text-[clamp(0.9rem,1.8vh,1.35rem)]" : ""}`}
        >
          <span
            className={`font-display font-bold text-accent tabular-nums ${
              isTv ? "text-[clamp(1.5rem,3.2vh,2.75rem)]" : "text-3xl"
            }`}
          >
            {data ? total : "—"}
          </span>{" "}
          {t("lbPhotosTaken")}
        </p>
      </div>

      {error && <p className="mt-6 shrink-0 text-center text-sm text-destructive">{error}</p>}

      {!data && !error && (
        <p className="mt-10 shrink-0 text-center text-foreground/50">{t("lbLoading")}</p>
      )}

      {data && (
        <ol
          className={
            isTv
              ? isHorizontal
                ? "mt-4 grid min-h-0 flex-1 grid-cols-2 gap-x-[1.4vw] gap-y-[0.7vh] overflow-hidden lg:grid-cols-3"
                : "mt-4 flex min-h-0 flex-1 flex-col gap-[0.55vh] overflow-hidden"
              : isHorizontal
                ? "mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2"
                : "mt-10 space-y-3"
          }
        >
          {data.professions.map((row, i) => (
            <ProfessionRow
              key={row.id}
              row={row}
              maxCount={maxCount}
              index={i}
              highlighted={highlightId === row.id}
              isTop={row.rank === 1 && row.count > 0}
              tv={isTv}
              horizontal={isHorizontal}
              bumpToken={bumpTokens[row.id] ?? 0}
              title={professionTitleById(row.id, locale, row.title)}
              youLabel={t("lbYou")}
              leadingLabel={t("lbLeading")}
            />
          ))}
        </ol>
      )}

      {!isTv && (
        <div className="mt-10 flex justify-center">
          <Link
            to="/"
            className="rounded-2xl bg-gradient-to-r from-primary to-accent px-8 py-4 font-display text-lg font-bold text-white shadow-lg transition hover:scale-[1.01] motion-reduce:transform-none"
          >
            {t("lbTakePhoto")}
          </Link>
        </div>
      )}
    </div>
  );
}

function ProfessionRow({
  row,
  maxCount,
  index,
  highlighted,
  isTop,
  tv,
  horizontal,
  bumpToken,
  title,
  youLabel,
  leadingLabel,
}: {
  row: LeaderboardProfession;
  maxCount: number;
  index: number;
  highlighted: boolean;
  isTop: boolean;
  tv: boolean;
  horizontal: boolean;
  bumpToken: number;
  title: string;
  youLabel: string;
  leadingLabel: string;
}) {
  const [celebrating, setCelebrating] = useState(false);
  const [enterAnim, setEnterAnim] = useState(true);
  const lastBumpRef = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => setEnterAnim(false), 520 + index * 55);
    return () => window.clearTimeout(t);
  }, [index]);

  useEffect(() => {
    if (bumpToken <= 0 || bumpToken === lastBumpRef.current) return;
    lastBumpRef.current = bumpToken;
    // Remount bump classes so a second update while glowing still flashes.
    setCelebrating(false);
    const start = window.requestAnimationFrame(() => setCelebrating(true));
    const t = window.setTimeout(() => setCelebrating(false), BUMP_CELEBRATE_MS);
    return () => {
      window.cancelAnimationFrame(start);
      window.clearTimeout(t);
    };
  }, [bumpToken]);

  const count = useCountUp(row.count, {
    durationMs: bumpToken > 0 ? 900 : 1000 + index * 40,
    delayMs: bumpToken > 0 ? BUMP_COUNT_DELAY_MS : index * 40,
    enabled: true,
  });

  // Sync bar to the live count so it grows with the number after the reflect.
  const pct = Math.max(4, (count / maxCount) * 100);
  const barReady = count > 0 || row.count === 0;

  return (
    <li
      className={`motion-reduce:animate-none rounded-2xl border backdrop-blur-sm transition-[border-color,background-color] ${
        enterAnim && !celebrating ? "leaderboard-row-enter" : ""
      } ${
        tv
          ? horizontal
            ? "flex min-h-0 items-center px-[1.2vw] py-[0.85vh]"
            : "flex min-h-0 flex-1 items-center px-[1.6vw] py-[0.4vh]"
          : "px-4 py-3"
      } ${
        celebrating
          ? highlighted
            ? "leaderboard-row-bump leaderboard-row-bump-you border-accent/80 bg-accent/25"
            : "leaderboard-row-bump border-accent/70 bg-accent/20"
          : highlighted
            ? "border-accent/60 bg-accent/15 ring-2 ring-accent/40"
            : isTop
              ? "border-primary/40 bg-primary/10"
              : "border-white/10 bg-white/5"
      }`}
      style={enterAnim && !celebrating ? { animationDelay: `${index * 55}ms` } : undefined}
    >
      {celebrating && (
        <span
          key={`reflect-${bumpToken}`}
          className="leaderboard-reflect motion-reduce:hidden"
          aria-hidden
        />
      )}
      <div className={`relative z-[2] flex w-full items-center ${tv ? "gap-[1.2vw]" : "gap-3"}`}>
        <span
          className={`flex shrink-0 items-center justify-center rounded-xl font-display font-bold ${
            tv
              ? "h-[clamp(2rem,4.2vh,3.25rem)] w-[clamp(2rem,4.2vh,3.25rem)] text-[clamp(0.95rem,2.2vh,1.5rem)]"
              : "h-10 w-10 text-lg"
          } ${isTop || celebrating ? "bg-accent text-accent-foreground" : "bg-white/10 text-foreground"}`}
        >
          {count}
        </span>
        <span
          key={celebrating ? `emoji-${bumpToken}` : "emoji"}
          className={`${tv ? "text-[clamp(1.4rem,3.4vh,2.4rem)]" : "text-3xl"} ${
            celebrating
              ? `${professionEmojiFlairClass(row.id, "once")} motion-reduce:animate-none`
              : ""
          }`}
          aria-hidden
        >
          {row.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate font-display font-semibold text-foreground ${
              tv ? "text-[clamp(1rem,2.4vh,1.75rem)]" : "text-lg"
            }`}
          >
            {title}
            {highlighted && (
              <span className="ml-2 text-xs font-sans font-normal uppercase tracking-wider text-accent">
                {youLabel}
              </span>
            )}
            {isTop && !highlighted && row.count > 0 && (
              <span
                className={`ml-2 font-sans font-normal uppercase tracking-wider text-primary ${
                  tv ? "text-[clamp(0.55rem,1.2vh,0.75rem)]" : "text-xs"
                }`}
              >
                {leadingLabel}
              </span>
            )}
          </p>
          <div
            className={`mt-1.5 overflow-hidden rounded-full bg-white/10 ${
              tv ? "h-[clamp(0.35rem,0.9vh,0.65rem)]" : "h-2.5"
            }`}
          >
            <div
              className={`h-full rounded-full ${
                bumpToken > 0
                  ? ""
                  : "transition-[width] duration-1000 ease-out motion-reduce:transition-none"
              } ${
                highlighted || celebrating
                  ? "bg-gradient-to-r from-accent to-primary"
                  : isTop
                    ? "bg-gradient-to-r from-primary to-accent"
                    : "bg-white/35"
              }`}
              style={{ width: barReady ? `${pct}%` : "0%" }}
            />
          </div>
        </div>
        {row.latestThumbnails.length > 0 && (
          <ThumbnailStack thumbs={row.latestThumbnails.slice(0, 3)} tv={tv} />
        )}
      </div>
    </li>
  );
}

function ThumbnailStack({ thumbs, tv }: { thumbs: string[]; tv: boolean }) {
  const n = thumbs.length;
  // Slightly smaller when packing 3 so TV rows still fit.
  const sizeClass = tv
    ? n >= 3
      ? "h-[clamp(1.9rem,4.1vh,3.15rem)] w-[clamp(1.9rem,4.1vh,3.15rem)]"
      : n === 2
        ? "h-[clamp(2.1rem,4.6vh,3.5rem)] w-[clamp(2.1rem,4.6vh,3.5rem)]"
        : "h-[clamp(2.4rem,5.2vh,4rem)] w-[clamp(2.4rem,5.2vh,4rem)]"
    : n >= 3
      ? "h-10 w-10"
      : "h-12 w-12";

  const overlapClass = n >= 2 ? (tv ? "-space-x-[1.1vw]" : "-space-x-3") : "";

  // Left → right: third, second, latest (latest at row edge, on top).
  const ordered = [...thumbs].reverse();

  return (
    <div
      className={`flex shrink-0 items-center ${overlapClass} ${tv ? "" : "hidden sm:flex"}`}
      aria-hidden
    >
      {ordered.map((src, i) => {
        const fromLatest = n - 1 - i; // 0 = latest
        return (
          <img
            key={`${src}-${fromLatest}`}
            src={src}
            alt=""
            className={`${sizeClass} rounded-full object-cover ring-2 ${
              fromLatest === 0
                ? "relative z-[3] ring-white/45"
                : fromLatest === 1
                  ? "relative z-[2] ring-white/30 opacity-95"
                  : "relative z-[1] ring-white/20 opacity-90"
            }`}
          />
        );
      })}
    </div>
  );
}

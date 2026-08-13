import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Profession } from "@/lib/professions";
import {
  CAREER_REACTION_DURATION_MS,
  CAREER_REACTION_REDUCED_MS,
  getCareerReaction,
  type CareerReactionEffect,
} from "@/lib/career-reactions";

type Props = {
  career: Profession;
  onComplete: () => void;
};

/** Module lock so a new reaction cancels / replaces any previous one. */
let activeReactionToken = 0;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function EffectLayer({
  effect,
  accents,
}: {
  effect: CareerReactionEffect;
  accents: string[];
}) {
  switch (effect) {
    case "plane":
      return (
        <div className="cr-fx cr-fx--plane" aria-hidden>
          <span className="cr-cloud cr-cloud--1">☁️</span>
          <span className="cr-cloud cr-cloud--2">☁️</span>
          <span className="cr-cloud cr-cloud--3">☁️</span>
          <span className="cr-trail cr-trail--1" />
          <span className="cr-trail cr-trail--2" />
          <span className="cr-trail cr-trail--3" />
        </div>
      );
    case "heartbeat":
      return (
        <div className="cr-fx cr-fx--heartbeat" aria-hidden>
          <svg className="cr-ecg" viewBox="0 0 400 80" preserveAspectRatio="none">
            <polyline
              className="cr-ecg-line"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              points="0,40 40,40 55,40 70,10 85,70 100,40 140,40 155,40 170,15 185,65 200,40 260,40 275,40 290,8 305,72 320,40 400,40"
            />
          </svg>
          <span className="cr-heart cr-heart--1">❤️</span>
          <span className="cr-heart cr-heart--2">💗</span>
        </div>
      );
    case "launch":
      return (
        <div className="cr-fx cr-fx--launch" aria-hidden>
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i} className={`cr-star cr-star--${(i % 6) + 1}`} />
          ))}
          <span className="cr-glow" />
          <span className="cr-plume" />
          <span className="cr-plume cr-plume--2" />
        </div>
      );
    case "rescue":
      return (
        <div className="cr-fx cr-fx--rescue" aria-hidden>
          <span className="cr-siren-bar cr-siren-bar--red" />
          <span className="cr-siren-bar cr-siren-bar--amber" />
          <span className="cr-flame cr-flame--1">🔥</span>
          <span className="cr-flame cr-flame--2">🔥</span>
          <span className="cr-flame cr-flame--3">🔥</span>
          <span className="cr-spark cr-spark--1">✨</span>
          <span className="cr-spark cr-spark--2">💧</span>
          <span className="cr-spark cr-spark--3">✨</span>
        </div>
      );
    case "siren":
      return (
        <div className="cr-fx cr-fx--siren" aria-hidden>
          <span className="cr-sweep cr-sweep--red" />
          <span className="cr-sweep cr-sweep--blue" />
          <span className="cr-badge-ring" />
        </div>
      );
    case "kitchen":
      return (
        <div className="cr-fx cr-fx--kitchen" aria-hidden>
          <span className="cr-steam cr-steam--1" />
          <span className="cr-steam cr-steam--2" />
          <span className="cr-steam cr-steam--3" />
          <span className="cr-utensil cr-utensil--pan">🍳</span>
          <span className="cr-utensil cr-utensil--spoon">🥄</span>
          <span className="cr-utensil cr-utensil--knife">🔪</span>
        </div>
      );
    case "speed":
      return (
        <div className="cr-fx cr-fx--speed" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className={`cr-speedline cr-speedline--${i + 1}`} />
          ))}
          <span className="cr-checkered" />
        </div>
      );
    case "goal":
      return (
        <div className="cr-fx cr-fx--goal" aria-hidden>
          <span className="cr-goal-net">🥅</span>
          {Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className={`cr-confetti cr-confetti--${(i % 8) + 1}`}
              style={
                {
                  "--cr-i": i,
                  left: `${20 + ((i * 17) % 60)}%`,
                  top: `${28 + ((i * 13) % 40)}%`,
                  animationDelay: `${2.7 + (i % 6) * 0.04}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      );
    case "discovery":
      return (
        <div className="cr-fx cr-fx--discovery" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={`cr-bubble cr-bubble--${(i % 5) + 1}`} />
          ))}
          <span className="cr-flash" />
          <span className="cr-beaker">{accents[0] ?? "🧪"}</span>
        </div>
      );
    case "paws":
      return (
        <div className="cr-fx cr-fx--paws" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className={`cr-paw cr-paw--${i + 1}`}>
              🐾
            </span>
          ))}
          <span className="cr-critter cr-critter--1">{accents[0] ?? "🐶"}</span>
          <span className="cr-critter cr-critter--2">{accents[1] ?? "🐱"}</span>
        </div>
      );
    case "gears":
      return (
        <div className="cr-fx cr-fx--gears" aria-hidden>
          <span className="cr-gear cr-gear--lg">⚙️</span>
          <span className="cr-gear cr-gear--md">⚙️</span>
          <span className="cr-gear cr-gear--sm">⚙️</span>
          <span className="cr-weld cr-weld--1">✨</span>
          <span className="cr-weld cr-weld--2">✨</span>
          <span className="cr-weld cr-weld--3">🔧</span>
        </div>
      );
    case "paint":
      return (
        <div className="cr-fx cr-fx--paint" aria-hidden>
          <span className="cr-splash cr-splash--1" />
          <span className="cr-splash cr-splash--2" />
          <span className="cr-splash cr-splash--3" />
          <span className="cr-stroke cr-stroke--1" />
          <span className="cr-stroke cr-stroke--2" />
          <span className="cr-stroke cr-stroke--3" />
          <span className="cr-palette">{accents[0] ?? "🖌️"}</span>
        </div>
      );
    default:
      return null;
  }
}

/**
 * Full-screen career unlock reaction after a successful photo transform.
 * Auto-completes after ~4s (shorter with reduced motion).
 */
export function CareerReaction({ career, onComplete }: Props) {
  const config = getCareerReaction(career);
  const reactId = useId();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [exiting, setExiting] = useState(false);
  const reduced = prefersReducedMotion();
  const duration = reduced
    ? CAREER_REACTION_REDUCED_MS
    : CAREER_REACTION_DURATION_MS;

  useEffect(() => {
    const token = ++activeReactionToken;
    const exitAt = Math.max(200, duration - 600);
    const exitTimer = window.setTimeout(() => {
      if (token !== activeReactionToken) return;
      setExiting(true);
    }, exitAt);
    const doneTimer = window.setTimeout(() => {
      if (token !== activeReactionToken) return;
      onCompleteRef.current();
    }, duration);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
      // Invalidate this instance if unmounted or superseded
      if (token === activeReactionToken) {
        activeReactionToken += 1;
      }
    };
  }, [career.id, duration]);

  return (
    <div
      role="dialog"
      aria-label={config.text}
      aria-modal="true"
      data-career={config.id}
      data-effect={config.effect}
      data-reduced={reduced ? "true" : "false"}
      data-exiting={exiting ? "true" : "false"}
      className="career-reaction"
      id={reactId}
    >
      <div className="career-reaction__veil" />

      <div className="career-reaction__stage">
        <EffectLayer effect={config.effect} accents={config.accents} />

        <div className={`career-reaction__char career-reaction__char--${config.effect}`}>
          <span className="career-reaction__emoji" aria-hidden>
            {career.emoji}
          </span>
        </div>

        <p className="career-reaction__text">{config.text}</p>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Animate an integer toward `to` over `durationMs`.
 * When `from` is omitted, continues from the last displayed value.
 * Instantly snaps when reduced motion is preferred.
 */
export function useCountUp(
  to: number,
  {
    from,
    durationMs = 1200,
    delayMs = 0,
    enabled = true,
  }: {
    from?: number;
    durationMs?: number;
    /** Wait before starting the tween (e.g. after a highlight flash). */
    delayMs?: number;
    enabled?: boolean;
  } = {},
) {
  const [value, setValue] = useState(() =>
    enabled ? (from ?? 0) : to,
  );
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!enabled) {
      setValue(to);
      return;
    }

    const startFrom = from !== undefined ? from : valueRef.current;

    if (prefersReducedMotion() || startFrom === to) {
      setValue(to);
      return;
    }

    let frame = 0;
    let delayTimer = 0;
    let start = 0;
    const delta = to - startFrom;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // Ease-out cubic
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(startFrom + delta * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    const begin = () => {
      start = performance.now();
      frame = requestAnimationFrame(tick);
    };

    if (delayMs > 0) {
      setValue(startFrom);
      delayTimer = window.setTimeout(begin, delayMs);
    } else {
      begin();
    }

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(delayTimer);
    };
  }, [to, from, durationMs, delayMs, enabled]);

  return value;
}

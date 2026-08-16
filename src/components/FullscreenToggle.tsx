import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "smart-start:prefer-fullscreen";

function getFullscreenElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function isFullscreenActive(): boolean {
  return getFullscreenElement() != null;
}

function readPreferred(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePreferred(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

async function enterFullscreen(): Promise<void> {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  if (isFullscreenActive()) return;
  if (el.requestFullscreen) {
    await el.requestFullscreen();
    return;
  }
  if (el.webkitRequestFullscreen) {
    await el.webkitRequestFullscreen();
  }
}

async function exitFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  if (!isFullscreenActive()) return;
  if (document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }
  if (doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen();
  }
}

/**
 * Global enter/exit fullscreen control. Mount once (e.g. in root layout).
 * Stays in fullscreen across booth stage changes. Cleanup never calls exitFullscreen.
 * Esc / the toggle are the only intentional exits; browser-forced drops keep preference
 * and re-enter on the next user gesture when possible.
 */
export function FullscreenToggle() {
  const [active, setActive] = useState(false);
  const [preferred, setPreferred] = useState(false);
  const [supported, setSupported] = useState(true);
  /** True only when the user meant to leave fullscreen (button or Esc). */
  const intentionalExitRef = useRef(false);
  const preferredRef = useRef(false);
  const restoringRef = useRef(false);

  useEffect(() => {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => void;
    };
    const canEnter =
      typeof el.requestFullscreen === "function" ||
      typeof el.webkitRequestFullscreen === "function";
    setSupported(canEnter);

    const initialPreferred = readPreferred();
    preferredRef.current = initialPreferred;
    setPreferred(initialPreferred);
    setActive(isFullscreenActive());

    const sync = () => {
      const nowActive = isFullscreenActive();
      setActive(nowActive);

      if (nowActive) {
        preferredRef.current = true;
        setPreferred(true);
        writePreferred(true);
        intentionalExitRef.current = false;
        return;
      }

      // Left fullscreen. Only clear preference on intentional exit.
      if (intentionalExitRef.current) {
        intentionalExitRef.current = false;
        preferredRef.current = false;
        setPreferred(false);
        writePreferred(false);
        return;
      }

      // Unintentional drop (camera permission UI, focus steal, etc.) —
      // keep preference so the next gesture can restore fullscreen.
    };

    const markIntentionalExit = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreenActive()) {
        intentionalExitRef.current = true;
      }
    };

    /**
     * If the booth prefers fullscreen but the browser dropped it mid-flow,
     * the next pointer/touch/click is a valid gesture to re-enter.
     * Skip our own control — it handles enter/exit explicitly.
     */
    const restoreOnGesture = (e: Event) => {
      if (!preferredRef.current || isFullscreenActive() || restoringRef.current) {
        return;
      }
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest("[data-fullscreen-toggle]")
      ) {
        return;
      }
      restoringRef.current = true;
      void enterFullscreen()
        .catch(() => {
          /* gesture may still be blocked on some platforms */
        })
        .finally(() => {
          restoringRef.current = false;
        });
    };

    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    document.addEventListener("keydown", markIntentionalExit, true);
    // Capture so a job-card / Take photo tap restores FS before stage work runs.
    document.addEventListener("pointerdown", restoreOnGesture, true);

    return () => {
      // Listeners only — never exitFullscreen on unmount (would kill booth FS).
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      document.removeEventListener("keydown", markIntentionalExit, true);
      document.removeEventListener("pointerdown", restoreOnGesture, true);
    };
  }, []);

  if (!supported) return null;

  async function toggle() {
    try {
      if (isFullscreenActive()) {
        intentionalExitRef.current = true;
        await exitFullscreen();
      } else {
        intentionalExitRef.current = false;
        preferredRef.current = true;
        setPreferred(true);
        writePreferred(true);
        await enterFullscreen();
      }
    } catch {
      /* user denial or unsupported — UI stays in sync via events */
      intentionalExitRef.current = false;
    }
  }

  const needsRestore = preferred && !active;
  const label = active
    ? "Exit fullscreen"
    : needsRestore
      ? "Restore fullscreen"
      : "Enter fullscreen";

  return (
    <div
      data-fullscreen-toggle
      className={cn(
        "fixed z-[90] flex flex-col items-end gap-2",
        "bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))]",
        "print:hidden",
      )}
    >
      {needsRestore && (
        <button
          type="button"
          onClick={() => void toggle()}
          className={cn(
            "max-w-[11rem] rounded-full border border-white/20 bg-black/70 px-3 py-1.5",
            "text-left text-xs font-medium leading-snug text-white shadow-md backdrop-blur-sm",
            "hover:bg-black/80",
          )}
        >
          Tap to stay fullscreen
        </button>
      )}
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={() => void toggle()}
        aria-label={label}
        title={label}
        className={cn(
          "h-10 w-10 rounded-full border border-white/15",
          "bg-black/55 text-white shadow-md backdrop-blur-sm",
          "hover:bg-black/70 hover:text-white",
          "focus-visible:ring-white/40",
          needsRestore && "ring-2 ring-accent/70",
        )}
      >
        {active ? (
          <Minimize2 className="size-4" />
        ) : (
          <Maximize2 className="size-4" />
        )}
      </Button>
    </div>
  );
}

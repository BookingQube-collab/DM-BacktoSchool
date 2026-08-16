import { useEffect, useState } from "react";
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

async function enterFullscreen(): Promise<void> {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
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
 * Does not auto-enter on load — browsers block that without a user gesture.
 */
export function FullscreenToggle() {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => void;
    };
    const canEnter =
      typeof el.requestFullscreen === "function" ||
      typeof el.webkitRequestFullscreen === "function";
    setSupported(canEnter);
    setActive(isFullscreenActive());

    const sync = () => {
      const nowActive = isFullscreenActive();
      setActive(nowActive);
      try {
        localStorage.setItem(STORAGE_KEY, nowActive ? "1" : "0");
      } catch {
        /* ignore quota / private mode */
      }
    };

    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  if (!supported) return null;

  async function toggle() {
    try {
      if (isFullscreenActive()) {
        await exitFullscreen();
      } else {
        await enterFullscreen();
      }
    } catch {
      /* user denial or unsupported — UI stays in sync via events */
    }
  }

  const label = active ? "Exit fullscreen" : "Enter fullscreen";

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "fixed bottom-4 right-4 z-[90] h-10 w-10 rounded-full border border-white/15",
        "bg-black/55 text-white shadow-md backdrop-blur-sm",
        "hover:bg-black/70 hover:text-white",
        "focus-visible:ring-white/40",
        "print:hidden",
      )}
    >
      {active ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
    </Button>
  );
}

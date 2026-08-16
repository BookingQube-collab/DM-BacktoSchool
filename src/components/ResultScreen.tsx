import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Profession } from "@/lib/professions";
import { CareerReaction } from "./CareerReaction";
import { FutureIdCard } from "./FutureIdCard";

/** Canon SELPHY CP1500 postcard (KP/RP) — landscape 148×100 mm / 6×4" */
const SELPHY_PRINTER_HINT = "Canon SELPHY CP1500";
/**
 * Booth `/api/print` can take ~40s on SELPHY Wi‑Fi (IPP ack while printing).
 * Must outlive the 45s overlay so we never abort a still-working job.
 */
const SILENT_PRINT_TIMEOUT_MS = 60_000;
/** Kids wait for physical SELPHY output after the job is accepted */
const DESKTOP_PRINT_COUNTDOWN_SEC = 45;

type Props = {
  profession: Profession;
  imageUrl: string;
  onRestart: () => void;
};

type Branding = {
  doha_mall_logo_url?: string;
  printer_name?: string;
};

type PrintStatus = "idle" | "printing" | "done" | "error";

function guestPrintError(raw: string): string {
  const m = raw.toLowerCase();
  // Ambiguous client wait — do not claim the printer rejected the job.
  if (/taking longer than expected|may still be printing/i.test(m)) {
    return raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
  }
  if (
    /booth computer network|requires the app server|is the booth server running|win32/i.test(
      m,
    )
  ) {
    return "Open this app from the booth computer network.";
  }
  if (/not found|admin → settings|pick a detected printer/i.test(m)) {
    return "Printer name not found — ask staff to set it in Admin → Settings.";
  }
  if (
    /not reachable|could not reach selphy|selphy not reachable/i.test(m)
  ) {
    return "Printer not ready — check SELPHY power and Wi‑Fi (same network as the booth PC).";
  }
  if (/selphy wi‑?fi|selphy wifi|did not accept the job/i.test(raw)) {
    return "Printer not ready — check SELPHY power and Wi‑Fi (same network as the booth PC).";
  }
  if (/wi‑?fi|wifi|network\/ipp|ipp|wsd|soft.?driver|waiting for printer|microsoft ipp/i.test(m)) {
    return "Printer not ready — check SELPHY power and Wi‑Fi (same network as the booth PC).";
  }
  if (/timed out|not ready|offline|work offline|paused/i.test(m)) {
    return "Printer not ready — check power, connection, and paper.";
  }
  if (/0 bytes|not accepted|rejected/i.test(m)) {
    return "Printer did not accept the job — ask staff to check SELPHY Wi‑Fi and Admin settings.";
  }
  if (/photo|too small|empty|could not download|cors/i.test(m)) {
    return "Photo not ready — wait for the transform to finish, then retry.";
  }
  // Keep toast short; strip long “Available: …” lists
  const cut = raw.split(/\s+Available:/i)[0]?.trim() || raw;
  return cut.length > 120 ? `${cut.slice(0, 117)}…` : cut;
}

async function silentPrintApi(
  imageUrl: string,
  printerName: string,
): Promise<{ printer_name?: string; method?: string }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SILENT_PRINT_TIMEOUT_MS);
  try {
    const res = await fetch("/api/print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl,
        printer_name: printerName,
      }),
      signal: controller.signal,
    });

    let payload: {
      ok?: boolean;
      error?: string;
      printer_name?: string;
      method?: string;
    } = {};
    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      /* non-JSON */
    }

    if (!res.ok) {
      throw new Error(
        payload.error ||
          `Print request failed (${res.status}). Is the booth server running on this PC?`,
      );
    }
    // Server accepted / queued the job — never treat as "not ready".
    return { printer_name: payload.printer_name, method: payload.method };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      // Only after the full booth wait — still ambiguous (SELPHY may be printing).
      throw new Error(
        "Print is taking longer than expected. Check the SELPHY — it may still be printing. If not, retry.",
      );
    }
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    window.clearTimeout(timer);
  }
}

export function ResultScreen({ profession, imageUrl, onRestart }: Props) {
  const [showBeat, setShowBeat] = useState(true);
  const [branding, setBranding] = useState<Branding>({});
  const [printStatus, setPrintStatus] = useState<PrintStatus>("idle");
  const [showPrintOverlay, setShowPrintOverlay] = useState(false);
  const [countdownSec, setCountdownSec] = useState(DESKTOP_PRINT_COUNTDOWN_SEC);
  const dismissBeat = useCallback(() => setShowBeat(false), []);

  const printBusyRef = useRef(false);
  const printGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const countdownIntervalRef = useRef<number | null>(null);
  const statusResetTimerRef = useRef<number | null>(null);
  const countdownRemainingRef = useRef(0);
  const countdownResolveRef = useRef<(() => void) | null>(null);

  const clearCountdown = useCallback(() => {
    if (countdownIntervalRef.current != null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    const resolve = countdownResolveRef.current;
    countdownResolveRef.current = null;
    countdownRemainingRef.current = 0;
    resolve?.();
  }, []);

  const dismissPrintOverlay = useCallback(() => {
    clearCountdown();
    setShowPrintOverlay(false);
  }, [clearCountdown]);

  /** Tick 45→0; promise resolves when countdown hits 0 (or when cancelled). */
  const startPrintCountdown = useCallback(() => {
    clearCountdown();
    countdownRemainingRef.current = DESKTOP_PRINT_COUNTDOWN_SEC;
    setCountdownSec(DESKTOP_PRINT_COUNTDOWN_SEC);
    setShowPrintOverlay(true);

    const done = new Promise<void>((resolve) => {
      countdownResolveRef.current = resolve;
    });

    countdownIntervalRef.current = window.setInterval(() => {
      const next = countdownRemainingRef.current - 1;
      countdownRemainingRef.current = next;
      setCountdownSec(Math.max(0, next));
      if (next <= 0) {
        if (countdownIntervalRef.current != null) {
          window.clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        const resolve = countdownResolveRef.current;
        countdownResolveRef.current = null;
        resolve?.();
      }
    }, 1000);

    return done;
  }, [clearCountdown]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/branding");
        if (!res.ok) return;
        const data = (await res.json()) as Branding;
        if (!cancelled) setBranding(data);
      } catch {
        /* logo optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      printGenerationRef.current += 1;
      if (countdownIntervalRef.current != null) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      if (statusResetTimerRef.current != null) {
        window.clearTimeout(statusResetTimerRef.current);
        statusResetTimerRef.current = null;
      }
      countdownResolveRef.current = null;
    };
  }, []);

  const scheduleStatusIdle = (ms: number) => {
    if (statusResetTimerRef.current != null) {
      window.clearTimeout(statusResetTimerRef.current);
    }
    statusResetTimerRef.current = window.setTimeout(() => {
      statusResetTimerRef.current = null;
      setPrintStatus("idle");
    }, ms);
  };

  const handlePrint = async () => {
    if (printBusyRef.current || printStatus === "printing" || showPrintOverlay) {
      return;
    }
    if (!imageUrl?.trim()) {
      toast.error("Print failed — retry", {
        description: "Photo not ready — wait for the transform to finish, then retry.",
      });
      return;
    }

    const printerName =
      branding.printer_name?.trim() || SELPHY_PRINTER_HINT;
    const generation = ++printGenerationRef.current;
    const stillCurrent = () =>
      mountedRef.current && printGenerationRef.current === generation;

    printBusyRef.current = true;
    setPrintStatus("printing");

    try {
      // All booth clients (Windows + tablet): silent IPP via booth server + 45s wait.
      const countdownDone = startPrintCountdown();
      await silentPrintApi(imageUrl, printerName);
      if (!stillCurrent()) return;
      // Job accepted — finish the physical-print wait, then leave result screen.
      await countdownDone;
      if (!stillCurrent()) return;
      setShowPrintOverlay(false);
      setPrintStatus("done");
      toast.success("Sent to printer", {
        description: "Your photo is printing.",
      });
      // Same path as "PICK ANOTHER DREAM JOB!" → job selection (JobGrid).
      onRestart();
    } catch (e) {
      console.error(e);
      // Never toast failure after success navigation / unmount.
      if (!stillCurrent()) return;
      dismissPrintOverlay();
      const raw =
        e instanceof Error ? e.message : "Print failed. Try again.";
      setPrintStatus("error");
      toast.error("Print failed — retry", {
        description: guestPrintError(raw),
        duration: 8000,
      });
      scheduleStatusIdle(3000);
    } finally {
      if (printGenerationRef.current === generation) {
        printBusyRef.current = false;
      }
    }
  };

  const printLabel =
    printStatus === "printing"
      ? "Printing…"
      : printStatus === "done"
        ? "Sent to printer"
        : printStatus === "error"
          ? "Print failed — retry"
          : "Print";

  return (
    <div className="min-h-screen px-6 py-10">
      {showBeat && (
        <CareerReaction career={profession} onComplete={dismissBeat} />
      )}

      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8">
        <div className="text-center print:hidden">
          <p className="font-display text-sm uppercase tracking-[0.3em] text-accent">
            Meet your future self
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-foreground md:text-4xl">
            Congratulations, future {profession.title}!
          </h2>
        </div>

        <FutureIdCard
          profession={profession}
          imageUrl={imageUrl}
          mallLogoUrl={branding.doha_mall_logo_url || null}
        />

        <div className="flex w-full max-w-md flex-col gap-3 print:hidden">
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={printStatus === "printing" || showPrintOverlay}
            className="rounded-2xl bg-gradient-to-r from-primary to-accent px-6 py-5 font-display text-xl font-bold text-white shadow-lg transition hover:scale-[1.02] disabled:cursor-wait disabled:opacity-80 motion-reduce:transform-none"
          >
            {printLabel}
          </button>
          <button
            type="button"
            onClick={onRestart}
            disabled={printStatus === "printing" || showPrintOverlay}
            className="rounded-2xl bg-white/10 px-5 py-4 font-display text-lg font-semibold tracking-wide text-foreground ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-white/15 disabled:cursor-wait disabled:opacity-60"
          >
            PICK ANOTHER DREAM JOB!
          </button>
        </div>
      </div>

      {showPrintOverlay && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-[oklch(0.16_0.06_285_/0.82)] px-6 backdrop-blur-md print:hidden"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex max-w-md flex-col items-center text-center">
            <p className="font-display text-sm uppercase tracking-[0.35em] text-accent">
              Printing…
            </p>
            <h3 className="mt-3 font-display text-3xl font-bold text-white md:text-4xl">
              Your photo is printing
            </h3>
            <p
              className="mt-8 font-display text-[7rem] font-bold leading-none tabular-nums text-primary drop-shadow-sm md:text-[8.5rem]"
              aria-label={`${countdownSec} seconds remaining`}
            >
              {countdownSec}
            </p>
            <p className="mt-4 font-display text-base text-white/75 md:text-lg">
              Hang tight — almost ready!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

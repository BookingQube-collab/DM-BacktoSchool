import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PrintCountdownOverlay } from "@/components/PrintCountdownOverlay";
import { guestPrintError, silentPrintApi } from "@/lib/print-client";
import type { Profession } from "@/lib/professions";
import { localizedProfessionTitle } from "@/lib/professions";
import { useI18n } from "@/lib/i18n";
import { CareerReaction } from "./CareerReaction";
import { FutureIdCard } from "./FutureIdCard";

/** Canon SELPHY CP1500 postcard (KP/RP) — landscape 148×100 mm / 6×4" */
const SELPHY_PRINTER_HINT = "Canon SELPHY CP1500";
/** Kids wait for physical SELPHY output after the job is accepted */
const DESKTOP_PRINT_COUNTDOWN_SEC = 60;

type Props = {
  profession: Profession;
  imageUrl: string;
  onRestart: () => void;
};

type Branding = {
  doha_mall_logo_url?: string;
  printer_name?: string;
  booth_print_base_url?: string;
};

type PrintStatus = "idle" | "printing" | "done" | "error";

export function ResultScreen({ profession, imageUrl, onRestart }: Props) {
  const { t, locale } = useI18n();
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

  /** Tick 60→0; promise resolves when countdown hits 0 (or when cancelled). */
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

  const finishPrintSuccess = (stillCurrent: () => boolean) => {
    if (!stillCurrent()) return;
    setShowPrintOverlay(false);
    setPrintStatus("done");
    toast.success(t("resultToastSent"), {
      description: t("resultToastSentDesc"),
    });
    onRestart();
  };

  const handlePrint = async () => {
    if (printBusyRef.current || printStatus === "printing" || showPrintOverlay) {
      return;
    }
    if (!imageUrl?.trim()) {
      toast.error(t("resultPrintFailed"), {
        description: t("resultPhotoNotReady"),
      });
      return;
    }

    const printerName = branding.printer_name?.trim() || SELPHY_PRINTER_HINT;
    const boothPrintBaseUrl = branding.booth_print_base_url?.trim() || "";
    const generation = ++printGenerationRef.current;
    const stillCurrent = () =>
      mountedRef.current && printGenerationRef.current === generation;

    printBusyRef.current = true;
    setPrintStatus("printing");

    try {
      const countdownDone = startPrintCountdown();
      await silentPrintApi(imageUrl, printerName, boothPrintBaseUrl);
      if (!stillCurrent()) return;
      await countdownDone;
      finishPrintSuccess(stillCurrent);
    } catch (e) {
      console.error(e);
      if (!stillCurrent()) return;
      dismissPrintOverlay();
      const raw = e instanceof Error ? e.message : t("resultPrintGeneric");
      setPrintStatus("error");
      toast.error(t("resultPrintFailed"), {
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
      ? t("resultPrinting")
      : printStatus === "done"
        ? t("resultSent")
        : printStatus === "error"
          ? t("resultPrintFailed")
          : t("resultPrint");

  return (
    <div className="min-h-screen px-6 py-10">
      {showBeat && (
        <CareerReaction career={profession} onComplete={dismissBeat} />
      )}

      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8">
        <div className="text-center">
          <p className="font-display text-sm uppercase tracking-[0.3em] text-accent">
            {t("resultMeetFuture")}
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-foreground md:text-4xl">
            {t("resultCongrats", {
              title: localizedProfessionTitle(profession, locale),
            })}
          </h2>
        </div>

        <FutureIdCard
          profession={profession}
          imageUrl={imageUrl}
          mallLogoUrl={branding.doha_mall_logo_url || null}
        />

        <div className="flex w-full max-w-md flex-col gap-3">
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
            {t("resultPickAnother")}
          </button>
        </div>
      </div>

      {showPrintOverlay ? <PrintCountdownOverlay seconds={countdownSec} /> : null}
    </div>
  );
}

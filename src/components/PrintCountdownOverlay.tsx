import { useI18n } from "@/lib/i18n";

export type PrintOverlayPhase = "sending" | "printing";

export function PrintCountdownOverlay({
  seconds,
  phase,
}: {
  seconds: number;
  phase: PrintOverlayPhase;
}) {
  const { t } = useI18n();
  const sending = phase === "sending";
  const finishing = !sending && seconds <= 0;
  const showSpinner = sending || finishing;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[oklch(0.16_0.06_285_/0.82)] px-6 backdrop-blur-md print:hidden"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex max-w-md flex-col items-center text-center">
        <p className="font-display text-sm uppercase tracking-[0.35em] text-accent">
          {sending ? t("resultPrintSending") : t("resultPrinting")}
        </p>
        <h3 className="mt-3 font-display text-3xl font-bold text-white md:text-4xl">
          {sending
            ? t("resultPrintSendingHint")
            : finishing
              ? t("resultPrintFinishing")
              : t("resultPhotoPrinting")}
        </h3>
        {showSpinner ? (
          <div
            className="mt-10 h-16 w-16 animate-spin rounded-full border-4 border-white/25 border-t-primary"
            aria-hidden
          />
        ) : (
          <p
            className="mt-8 font-display text-[7rem] font-bold leading-none tabular-nums text-primary drop-shadow-sm md:text-[8.5rem]"
            aria-label={t("resultSecondsLeft", { count: seconds })}
          >
            {seconds}
          </p>
        )}
        <p className="mt-4 font-display text-base text-white/75 md:text-lg">
          {sending ? t("resultPrintStaffHint") : t("resultHangTight")}
        </p>
      </div>
    </div>
  );
}

import { useI18n } from "@/lib/i18n";

export function PrintCountdownOverlay({ seconds }: { seconds: number }) {
  const { t } = useI18n();
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[oklch(0.16_0.06_285_/0.82)] px-6 backdrop-blur-md print:hidden"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex max-w-md flex-col items-center text-center">
        <p className="font-display text-sm uppercase tracking-[0.35em] text-accent">
          {t("resultPrinting")}
        </p>
        <h3 className="mt-3 font-display text-3xl font-bold text-white md:text-4xl">
          {t("resultPhotoPrinting")}
        </h3>
        <p
          className="mt-8 font-display text-[7rem] font-bold leading-none tabular-nums text-primary drop-shadow-sm md:text-[8.5rem]"
          aria-label={t("resultSecondsLeft", { count: seconds })}
        >
          {seconds}
        </p>
        <p className="mt-4 font-display text-base text-white/75 md:text-lg">
          {t("resultHangTight")}
        </p>
      </div>
    </div>
  );
}

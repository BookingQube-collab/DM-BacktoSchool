import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      data-language-toggle
      className={cn(
        "fixed z-[90] flex items-center",
        "top-[max(0.75rem,env(safe-area-inset-top))]",
        "right-[max(0.75rem,env(safe-area-inset-right))]",
        "print:hidden",
      )}
      role="group"
      aria-label={t("langToggle")}
    >
      <div className="inline-flex overflow-hidden rounded-full border border-white/20 bg-black/60 p-0.5 text-xs font-bold shadow-md backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setLocale("en")}
          aria-pressed={locale === "en"}
          className={cn(
            "rounded-full px-2.5 py-1 tracking-wide transition-colors",
            locale === "en"
              ? "bg-white text-slate-900"
              : "text-white/80 hover:text-white",
          )}
        >
          {t("langEn")}
        </button>
        <button
          type="button"
          onClick={() => setLocale("ar")}
          aria-pressed={locale === "ar"}
          className={cn(
            "rounded-full px-2.5 py-1 tracking-wide transition-colors",
            locale === "ar"
              ? "bg-white text-slate-900"
              : "text-white/80 hover:text-white",
          )}
        >
          {t("langAr")}
        </button>
      </div>
    </div>
  );
}

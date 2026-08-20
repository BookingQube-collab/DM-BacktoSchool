import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Profession } from "@/lib/professions";
import { localizedProfessionTag, localizedProfessionTitle } from "@/lib/professions";
import { useI18n } from "@/lib/i18n";

type Props = {
  profession: Profession;
  imageUrl: string;
  mallLogoUrl?: string | null;
};

export const FutureIdCard = forwardRef<HTMLDivElement, Props>(
  function FutureIdCard({ profession, imageUrl, mallLogoUrl }, ref) {
    const { t, locale } = useI18n();
    const issued = new Date().toLocaleDateString(locale === "ar" ? "ar-QA" : "en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    return (
      <div
        ref={ref}
        className="print-card mx-auto w-full max-w-2xl overflow-hidden rounded-[1.5rem] bg-white text-slate-900 shadow-2xl ring-1 ring-black/5"
      >
        {/* SELPHY CP1500 postcard: 148×100 mm landscape (6×4") */}
        <div className="print-card-face flex aspect-[148/100] flex-col">
          <div className="relative flex shrink-0 items-center justify-between gap-3 bg-gradient-to-r from-primary via-primary to-accent px-5 py-3 text-white">
            <span className="font-display text-xs uppercase tracking-[0.25em] opacity-90">
              {t("futureId")}
            </span>
            <span className="shrink-0 font-display text-lg font-black tracking-wider">
              E3
            </span>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-white/0 via-white/60 to-white/0" />
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[1.15fr_1fr] gap-0">
            <div className="relative min-h-0 overflow-hidden bg-slate-100">
              <img
                src={imageUrl}
                alt={t("futureIdAlt", { title: localizedProfessionTitle(profession, locale) })}
                className="h-full w-full object-cover"
                crossOrigin="anonymous"
              />
              {mallLogoUrl ? (
                <div className="absolute bottom-2 left-2 rounded-md bg-white/15 px-1.5 py-1 backdrop-blur-[2px]">
                  <img
                    src={mallLogoUrl}
                    alt="Doha Mall"
                    className="h-7 max-w-[5.5rem] bg-transparent object-contain object-left md:h-8 md:max-w-[6.5rem]"
                    crossOrigin="anonymous"
                  />
                </div>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-col items-center px-3 py-3 md:px-4 md:py-4">
              <div className="flex min-h-0 w-full shrink flex-col items-center text-center">
                <p className="font-display text-2xl font-extrabold leading-tight text-slate-900 md:text-3xl">
                  {localizedProfessionTitle(profession, locale)}
                </p>
                <p className="mt-1 text-sm text-slate-500 md:text-base">
                  "{localizedProfessionTag(profession, locale)}"
                </p>
                <span className="mt-2 inline-block text-3xl leading-none" aria-hidden>
                  {profession.emoji}
                </span>
              </div>

              <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center py-2">
                <div
                  className="rounded-md bg-white p-1"
                  aria-label={t("futureIdScan")}
                >
                  <QRCodeSVG
                    value={imageUrl}
                    size={168}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                    className="h-[clamp(8.75rem,20vmin,11.25rem)] w-[clamp(8.75rem,20vmin,11.25rem)]"
                  />
                </div>
              </div>

              <div className="flex w-full shrink-0 items-center justify-between border-t border-dashed border-slate-200 pt-2.5 text-xs uppercase tracking-widest text-slate-500">
                <span>{t("futureIdIssued")}</span>
                <span className="font-semibold text-slate-700">{issued}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

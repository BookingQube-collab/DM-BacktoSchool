import { forwardRef } from "react";
import type { Profession } from "@/lib/professions";

type Props = {
  profession: Profession;
  imageUrl: string;
};

export const FutureIdCard = forwardRef<HTMLDivElement, Props>(
  function FutureIdCard({ profession, imageUrl }, ref) {
    const issued = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    return (
      <div
        ref={ref}
        className="print-card mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] bg-white text-slate-900 shadow-2xl ring-1 ring-black/5"
      >
        <div className="relative bg-gradient-to-r from-primary via-primary to-accent px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs uppercase tracking-[0.25em] opacity-90">
              Future ID
            </span>
            <span className="font-display text-lg font-black tracking-wider">
              E3
            </span>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-white/0 via-white/60 to-white/0" />
        </div>

        <div className="p-5">
          <div className="aspect-[3/4] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            <img
              src={imageUrl}
              alt={`Future ${profession.title}`}
              className="h-full w-full object-cover"
              crossOrigin="anonymous"
            />
          </div>

          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-2xl font-extrabold leading-tight text-slate-900">
                {profession.title}
              </p>
              <p className="text-sm text-slate-500">"{profession.tag}"</p>
            </div>
            <span className="text-3xl" aria-hidden>
              {profession.emoji}
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-dashed border-slate-200 pt-3 text-xs uppercase tracking-widest text-slate-500">
            <span>Issued</span>
            <span className="font-semibold text-slate-700">{issued}</span>
          </div>
        </div>
      </div>
    );
  },
);

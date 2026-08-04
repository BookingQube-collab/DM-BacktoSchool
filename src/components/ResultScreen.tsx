import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toPng } from "html-to-image";
import type { Profession } from "@/lib/professions";
import { FutureIdCard } from "./FutureIdCard";

type Props = {
  profession: Profession;
  imageUrl: string;
  onRestart: () => void;
};

export function ResultScreen({ profession, imageUrl, onRestart }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleSave = async () => {
    if (!cardRef.current) return;
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `future-me-${profession.id}.png`;
      a.click();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8">
        <div className="text-center print:hidden">
          <p className="font-display text-sm uppercase tracking-[0.3em] text-accent">
            Meet your future self
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-foreground md:text-4xl">
            Congratulations, future {profession.title}!
          </h2>
        </div>

        <FutureIdCard ref={cardRef} profession={profession} imageUrl={imageUrl} />

        <div className="grid w-full max-w-md grid-cols-2 gap-3 print:hidden">
          <button
            onClick={handleSave}
            className="rounded-2xl bg-white/10 px-5 py-4 font-display text-lg font-semibold text-foreground ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-white/15"
          >
            Save card
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-2xl bg-white/10 px-5 py-4 font-display text-lg font-semibold text-foreground ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-white/15"
          >
            Print
          </button>
          <button
            onClick={onRestart}
            className="col-span-2 rounded-2xl bg-gradient-to-r from-primary to-accent px-5 py-4 font-display text-lg font-bold text-white shadow-lg transition hover:scale-[1.01] motion-reduce:transform-none"
          >
            Try another job
          </button>
        </div>

        <div className="mt-2 flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-sm print:hidden">
          <div className="rounded-2xl bg-white p-3">
            <QRCodeSVG value={imageUrl} size={140} level="M" />
          </div>
          <p className="font-display text-lg font-semibold text-foreground">
            Scan to take your photo home
          </p>
          <p className="max-w-xs text-sm text-foreground/60">
            Open your phone camera and point it at the code to save or share
            your future portrait.
          </p>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useI18n, type MessageKey } from "@/lib/i18n";

const GENERATING_KEYS: MessageKey[] = [
  "generating1",
  "generating2",
  "generating3",
  "generating4",
  "generating5",
];

export function Generating({ photoDataUrl }: { photoDataUrl: string }) {
  const [i, setI] = useState(0);
  const { t } = useI18n();
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % GENERATING_KEYS.length), 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md text-center">
        <div className="relative mx-auto aspect-[3/4] w-full overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
          <img
            src={photoDataUrl}
            alt=""
            className="h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-accent motion-reduce:animate-none" />
          </div>
        </div>
        <p
          key={i}
          className="mt-8 font-display text-2xl text-foreground animate-in fade-in motion-reduce:animate-none"
        >
          {t(GENERATING_KEYS[i])}
        </p>
        <p className="mt-2 text-sm text-foreground/60">{t("generatingWait")}</p>
      </div>
    </div>
  );
}

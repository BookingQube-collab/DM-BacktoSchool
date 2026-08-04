import { useEffect, useState } from "react";

const MESSAGES = [
  "Fast-forwarding time…",
  "Tailoring your uniform…",
  "Polishing the badge…",
  "Rehearsing your first day…",
  "Adding a splash of magic…",
];

export function Generating({ photoDataUrl }: { photoDataUrl: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % MESSAGES.length), 2000);
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
          {MESSAGES[i]}
        </p>
        <p className="mt-2 text-sm text-foreground/60">
          This can take up to a minute.
        </p>
      </div>
    </div>
  );
}

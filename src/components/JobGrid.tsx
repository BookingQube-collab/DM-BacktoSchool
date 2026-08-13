import { PROFESSIONS, type Profession } from "@/lib/professions";

export function JobGrid({ onPick }: { onPick: (p: Profession) => void }) {
  return (
    <div className="min-h-screen w-full px-6 py-10 md:px-12 md:py-16">
      <div className="mx-auto max-w-6xl text-center">
        <h1 className="mx-auto flex max-w-md justify-center bg-transparent md:max-w-lg">
          <img
            src="/smart-start-logo.png"
            alt="Smart Start"
            className="h-auto w-full max-w-[280px] bg-transparent drop-shadow-lg md:max-w-[360px]"
          />
        </h1>
        <p className="mt-5 text-lg text-foreground/80 md:text-xl">
          Pick a job. Take a photo. Meet your future self.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {PROFESSIONS.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              className="job-card group flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-3xl border border-white/10 bg-white/5 p-5 text-center shadow-lg backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-accent/40 hover:bg-white/10 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/50 motion-reduce:transform-none motion-reduce:transition-none"
            >
              <span className="text-5xl" aria-hidden>
                {p.emoji}
              </span>
              <span className="font-display text-lg font-semibold text-foreground">
                {p.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

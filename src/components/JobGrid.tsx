import { PROFESSIONS, type Profession } from "@/lib/professions";

export function JobGrid({ onPick }: { onPick: (p: Profession) => void }) {
  return (
    <div className="min-h-screen w-full px-6 py-10 md:px-12 md:py-16">
      <div className="mx-auto max-w-6xl text-center">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-accent">
          E3 · Future Me
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold text-foreground md:text-6xl">
          What will you be when you grow up?
        </h1>
        <p className="mt-4 text-lg text-foreground/80 md:text-xl">
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

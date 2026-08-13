import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type Store = { id: string; name: string; logo_url: string | null };

type StorePickerProps = {
  featured: Store[];
  featuredSource: "sales" | "top_brands";
  selectedId: string;
  onSelect: (id: string) => void;
  loading?: boolean;
};

function StoreLogo({ store, className }: { store: Store; className?: string }) {
  if (store.logo_url) {
    return (
      <img
        src={store.logo_url}
        alt={store.name}
        className={cn("h-full w-full object-contain", className)}
      />
    );
  }
  return (
    <div className="flex h-full items-center justify-center px-2 text-center text-xs font-semibold text-muted-foreground sm:text-sm">
      {store.name}
    </div>
  );
}

function StoreCard({
  store,
  selected,
  onSelect,
  compact,
}: {
  store: Store;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex shrink-0 flex-col overflow-hidden rounded-3xl border text-left transition",
        compact ? "w-[7.5rem] sm:w-[8.5rem]" : "w-[8.5rem] sm:w-[9.5rem]",
        selected
          ? "border-accent ring-2 ring-accent/60"
          : "border-border hover:border-accent/50",
      )}
    >
      <div className="aspect-square overflow-hidden bg-white p-2.5 sm:p-3">
        <StoreLogo store={store} />
      </div>
      <div
        className={cn(
          "truncate px-2 py-2 text-center text-xs font-semibold sm:text-sm",
          selected ? "bg-accent/20 text-foreground" : "bg-secondary/60",
        )}
      >
        {store.name}
      </div>
    </button>
  );
}

export function StorePicker({
  featured,
  featuredSource,
  selectedId,
  onSelect,
  loading,
}: StorePickerProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Store[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [pickedStore, setPickedStore] = useState<Store | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const inFeatured = featured.some((s) => s.id === selectedId);
  const offFeaturedStore =
    selectedId && !inFeatured ? pickedStore : null;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/register?q=${encodeURIComponent(q)}`,
          );
          const data = await res.json();
          if (res.ok) {
            setSuggestions((data.stores as Store[]) ?? []);
          }
        } finally {
          setSearching(false);
        }
      })();
    }, 220);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function selectStore(store: Store) {
    onSelect(store.id);
    setPickedStore(featured.some((s) => s.id === store.id) ? null : store);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  }

  function clearSelection() {
    onSelect("");
    setPickedStore(null);
    setQuery("");
    setSuggestions([]);
  }

  const featuredHeading =
    featuredSource === "sales"
      ? "Popular stores"
      : "Featured stores";

  return (
    <div className="space-y-4">
      <div ref={wrapRef} className="relative space-y-2">
        <Label htmlFor="store_search" className="text-base">
          Search store
        </Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="store_search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="h-12 rounded-xl pl-11 pr-4 text-base"
            placeholder="Type store name…"
            autoComplete="off"
          />
        </div>

        {open && query.trim().length > 0 ? (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-border bg-popover shadow-xl">
            {searching ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                Searching…
              </p>
            ) : suggestions.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                No stores match &ldquo;{query.trim()}&rdquo;
              </p>
            ) : (
              <ul className="max-h-64 overflow-y-auto py-1">
                {suggestions.map((store) => (
                  <li key={store.id}>
                    <button
                      type="button"
                      onClick={() => selectStore(store)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-secondary/80"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5">
                        <StoreLogo store={store} />
                      </div>
                      <span className="min-w-0 truncate text-base font-medium">
                        {store.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {offFeaturedStore ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">
            Selected store
          </p>
          <div className="flex items-start gap-3">
            <StoreCard
              store={offFeaturedStore}
              selected
              onSelect={() => {}}
            />
            <button
              type="button"
              onClick={clearSelection}
              className="mt-1 flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label className="text-base">{featuredHeading}</Label>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading stores…</p>
        ) : featured.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No stores yet — add logos in Admin → Stores
          </p>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1 pb-2">
            <div className="flex gap-3 md:gap-4">
              {featured.map((store) => (
                <StoreCard
                  key={store.id}
                  store={store}
                  selected={selectedId === store.id}
                  onSelect={() => selectStore(store)}
                />
              ))}
            </div>
          </div>
        )}
        {!loading && featured.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {featuredSource === "sales"
              ? "Ranked by registrations. Search above for any store."
              : "Top brands to get started. Search above for any store."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

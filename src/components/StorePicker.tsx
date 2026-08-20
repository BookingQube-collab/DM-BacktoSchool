import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useVirtualKeyboard, useVkFieldProps } from "@/components/VirtualKeyboard";

export type Store = { id: string; name: string; logo_url: string | null };

type StorePickerProps = {
  stores: Store[];
  featuredSource: "sales" | "top_brands";
  selectedId: string;
  onSelect: (id: string) => void;
  loading?: boolean;
  toolbarExtra?: ReactNode;
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
}: {
  store: Store;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full min-w-0 flex-col overflow-hidden rounded-3xl border text-left transition landscape:rounded-2xl",
        selected ? "border-accent ring-2 ring-accent/60" : "border-border hover:border-accent/50",
      )}
    >
      <div className="aspect-square overflow-hidden bg-white p-2.5 sm:p-3 landscape:p-2">
        <StoreLogo store={store} />
      </div>
      <div
        className={cn(
          "truncate px-2 py-2 text-center text-xs font-semibold sm:text-sm landscape:py-1.5",
          selected ? "bg-accent/20 text-foreground" : "bg-secondary/60",
        )}
      >
        {store.name}
      </div>
    </button>
  );
}

export function StorePicker({
  stores,
  featuredSource,
  selectedId,
  onSelect,
  loading,
  toolbarExtra,
}: StorePickerProps) {
  const [query, setQuery] = useState("");
  const { t } = useI18n();
  const vk = useVirtualKeyboard();
  const searchVk = useVkFieldProps({
    id: "store_search",
    mode: "text",
    value: query,
    onChange: (next) => setQuery(next),
  });

  const q = query.trim().toLowerCase();
  const visible = q ? stores.filter((s) => s.name.toLowerCase().includes(q)) : stores;
  const featuredHeading = featuredSource === "sales" ? t("pickerPopular") : t("pickerFeatured");

  function selectStore(store: Store) {
    vk.dismiss();
    (document.activeElement instanceof HTMLElement ? document.activeElement : null)?.blur();
    const page = document.querySelector("[data-register-page]");
    if (page instanceof HTMLElement) page.scrollLeft = 0;
    onSelect(store.id);
    setQuery("");
  }

  return (
    <div className="flex min-h-0 min-w-0 max-w-full flex-col gap-4 landscape:flex-1 landscape:overflow-hidden landscape:gap-2.5">
      <div className="grid shrink-0 gap-4 landscape:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] landscape:items-start landscape:gap-4">
        <div className="relative min-w-0 space-y-2 landscape:space-y-1">
          <Label htmlFor="store_search" className="text-base landscape:text-base">
            {t("pickerSearchStore")}
          </Label>
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="store_search"
              type={vk.enabled ? "text" : "search"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 w-full scroll-mt-3 scroll-mb-[var(--vk-height,8rem)] rounded-xl ps-11 pe-4 text-base md:text-base landscape:h-14 landscape:text-lg data-[vk-active=true]:ring-2 data-[vk-active=true]:ring-accent"
              placeholder={t("pickerTypeStore")}
              autoComplete="off"
              {...searchVk}
            />
          </div>
        </div>
        {toolbarExtra}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 landscape:gap-1">
        <Label className="shrink-0 text-base">{q ? t("pickerSearchStore") : featuredHeading}</Label>
        <div className="scrollbar-none min-h-[12rem] min-w-0 flex-1 overflow-y-auto overscroll-contain pb-1 max-h-[min(52dvh,28rem)] landscape:min-h-0 landscape:max-h-none">
          {loading ? (
            <p className="px-1 py-6 text-sm text-muted-foreground">{t("pickerLoading")}</p>
          ) : stores.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t("pickerNoStores")}
            </p>
          ) : visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t("pickerNoMatch", { query: query.trim() })}
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(7.25rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] landscape:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] landscape:gap-2.5 md:landscape:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]">
              {visible.map((store) => (
                <StoreCard
                  key={store.id}
                  store={store}
                  selected={selectedId === store.id}
                  onSelect={() => selectStore(store)}
                />
              ))}
            </div>
          )}
        </div>
        {!loading && !q && stores.length > 0 ? (
          <p className="shrink-0 text-xs text-muted-foreground landscape:hidden">
            {featuredSource === "sales" ? t("pickerRankedSales") : t("pickerTopBrands")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

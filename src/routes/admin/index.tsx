import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Camera,
  Download,
  KeyRound,
  Receipt,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  NamedCountBarChart,
  NamedCountDonutChart,
  RegistrationsOverTimeChart,
  StoreValueBarChart,
} from "@/components/admin/AdminCharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DayBucket, NamedCount, StoreValueBucket } from "@/lib/admin-charts";
import { formatQar, defaultRegistrationsFromDate, todayISODate } from "@/lib/registration";
import { professionTitleById } from "@/lib/professions";
import { useAdminSession } from "@/lib/admin-session";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});

type StoreStat = StoreValueBucket;

type Stats = {
  from: string;
  to: string;
  companies: number;
  guests: number;
  photo_sessions: number;
  freepik_configured: boolean;
  daily_registrations: number;
  daily_transaction_value: number;
  by_store: StoreStat[];
  top_stores?: StoreStat[];
  highest_store: StoreStat | null;
  lowest_store: StoreStat | null;
  by_day?: DayBucket[];
  by_nationality?: NamedCount[];
  by_zone?: NamedCount[];
  by_profession?: NamedCount[];
  photos_by_day?: DayBucket[];
  stores_with_logo?: number;
  stores_without_logo?: number;
};

const TOP_STORES_LIMIT = 10;

function AdminDashboardPage() {
  const { t, locale } = useI18n();
  const { pages } = useAdminSession();
  const showApiTab = pages.includes("settings");
  const [from, setFrom] = useState(defaultRegistrationsFromDate);
  const [to, setTo] = useState(todayISODate);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [storeQuery, setStoreQuery] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  async function load(nextFrom = from, nextTo = to) {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from: nextFrom, to: nextTo });
      const res = await fetch(`/api/admin/stats?${qs}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load dashboard");
        return;
      }
      setStats(data as Stats);
    } catch {
      setError("Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setSuggestionsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function downloadCsv() {
    const qs = new URLSearchParams({ from, to, format: "csv" });
    const res = await fetch(`/api/admin/registrations?${qs}`, {
      credentials: "include",
    });
    if (!res.ok) {
      setError("Could not download CSV");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrations-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const allStores = stats?.by_store ?? [];

  const storeSuggestions = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    if (!q) return [];
    return allStores
      .filter((s) => s.store_name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allStores, storeQuery]);

  const selectedStore = useMemo(() => {
    if (!selectedStoreId) return null;
    return (
      allStores.find(
        (s) => (s.store_id ?? s.store_name) === selectedStoreId,
      ) ?? null
    );
  }, [allStores, selectedStoreId]);

  const displayedStores = useMemo(() => {
    if (selectedStore) return [selectedStore];

    const q = storeQuery.trim().toLowerCase();
    if (q) {
      return allStores
        .filter((s) => s.store_name.toLowerCase().includes(q))
        .slice(0, TOP_STORES_LIMIT);
    }

    if (stats?.top_stores?.length) return stats.top_stores.slice(0, TOP_STORES_LIMIT);

    return allStores
      .filter((s) => s.receipts > 0)
      .slice(0, TOP_STORES_LIMIT);
  }, [allStores, selectedStore, stats?.top_stores, storeQuery]);

  const chartStores = useMemo(() => {
    if (selectedStore) return [selectedStore];
    return displayedStores.filter((s) => s.receipts > 0);
  }, [displayedStores, selectedStore]);

  function pickStore(store: StoreStat) {
    setSelectedStoreId(store.store_id ?? store.store_name);
    setStoreQuery(store.store_name);
    setSuggestionsOpen(false);
  }

  function clearStoreFilter() {
    setSelectedStoreId(null);
    setStoreQuery("");
    setSuggestionsOpen(false);
  }

  const summaryCards = [
    {
      label: t("dashRegsInRange"),
      value: stats?.daily_registrations ?? "—",
      icon: Users,
    },
    {
      label: t("dashValueInRange"),
      value: stats ? formatQar(stats.daily_transaction_value) : "—",
      icon: Receipt,
    },
    {
      label: t("dashHighest"),
      value: stats?.highest_store
        ? `${stats.highest_store.store_name} (${stats.highest_store.receipts})`
        : "—",
      icon: ArrowUpRight,
    },
    {
      label: t("dashLowest"),
      value: stats?.lowest_store
        ? `${stats.lowest_store.store_name} (${stats.lowest_store.receipts})`
        : "—",
      icon: ArrowDownRight,
    },
  ] as const;

  const tableHeading = selectedStore
    ? selectedStore.store_name
    : storeQuery.trim()
      ? "Matching stores"
      : "Top stores";

  const emptyMessage = loading
    ? "Loading store stats…"
    : selectedStore
      ? "No transactions for this store in the selected date range."
      : storeQuery.trim()
        ? `No stores match “${storeQuery.trim()}”.`
        : "No registrations in this date range.";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{t("dashTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("dashSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/registrations">{t("dashViewRegs")}</Link>
          </Button>
          <Button type="button" variant="secondary" onClick={downloadCsv}>
            <Download className="size-4" />
            {t("commonDownloadCsv")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-border bg-secondary/40 p-4">
        <div className="space-y-2">
          <Label htmlFor="from">{t("commonFrom")}</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">{t("commonTo")}</Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <Button type="button" onClick={() => load(from, to)} disabled={loading}>
          <CalendarDays className="size-4" />
          {loading ? t("commonLoading") : t("commonApplyFilter")}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-3xl border border-border bg-secondary/40 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  {card.label}
                </p>
                <Icon className="size-5 shrink-0 text-accent" />
              </div>
              <p className="mt-4 font-display text-2xl font-bold leading-tight">
                {card.value}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StoreValueBarChart stores={chartStores} />
        <RegistrationsOverTimeChart days={stats?.by_day ?? []} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <NamedCountDonutChart
          title={t("dashNationalityMix")}
          subtitle={t("dashRegsInRangeShort")}
          items={stats?.by_nationality ?? []}
        />
        <NamedCountBarChart
          title={t("dashByZone")}
          subtitle={t("dashZoneBreakdown")}
          items={stats?.by_zone ?? []}
        />
        <NamedCountBarChart
          title={t("dashPhotosByProfession")}
          subtitle={t("dashBoothSessions")}
          items={(stats?.by_profession ?? []).map((item) => ({
            ...item,
            name: professionTitleById(item.name, locale, item.name),
          }))}
        />
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">
              Transaction value by store
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedStore
                ? "Showing the selected store for this date range."
                : `Top ${TOP_STORES_LIMIT} stores by transaction value. Search to find any store.`}
            </p>
          </div>
          <div ref={searchWrapRef} className="relative w-full max-w-sm space-y-2">
            <Label htmlFor="store_search">Search store</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="store_search"
                type="search"
                value={storeQuery}
                onChange={(e) => {
                  setStoreQuery(e.target.value);
                  setSelectedStoreId(null);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => setSuggestionsOpen(true)}
                className="rounded-xl pl-9 pr-9"
                placeholder="Type store name…"
                autoComplete="off"
                disabled={!stats && loading}
              />
              {storeQuery || selectedStoreId ? (
                <button
                  type="button"
                  onClick={clearStoreFilter}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Clear store search"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
            {suggestionsOpen && storeQuery.trim().length > 0 && !selectedStoreId ? (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-border bg-popover shadow-xl">
                {storeSuggestions.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    No stores match &ldquo;{storeQuery.trim()}&rdquo;
                  </p>
                ) : (
                  <ul className="max-h-64 overflow-y-auto py-1">
                    {storeSuggestions.map((store) => (
                      <li key={store.store_id ?? store.store_name}>
                        <button
                          type="button"
                          onClick={() => pickStore(store)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-secondary/80"
                        >
                          <span className="min-w-0 truncate font-medium">
                            {store.store_name}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatQar(store.transaction_value)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-3xl border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-secondary/60 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">{tableHeading}</th>
                <th className="px-4 py-3 font-semibold">Receipts</th>
                <th className="px-4 py-3 font-semibold">Transaction value</th>
              </tr>
            </thead>
            <tbody>
              {displayedStores.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                displayedStores.map((store, index) => (
                  <tr
                    key={store.store_id ?? store.store_name}
                    className="border-t border-border"
                  >
                    <td className="px-4 py-3 font-medium">
                      {!selectedStore && !storeQuery.trim() ? (
                        <span className="mr-2 text-muted-foreground">
                          {index + 1}.
                        </span>
                      ) : null}
                      {store.store_name}
                    </td>
                    <td className="px-4 py-3">{store.receipts}</td>
                    <td className="px-4 py-3">
                      {formatQar(store.transaction_value)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`grid gap-4 ${showApiTab ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <Link
          to="/admin/companies"
          className="rounded-3xl border border-border bg-secondary/30 p-4 hover:border-primary/40"
        >
          <Building2 className="mb-3 size-5 text-accent" />
          <p className="font-semibold">Stores</p>
          <p className="text-sm text-muted-foreground">
            {stats?.companies ?? 0} configured
            {typeof stats?.stores_with_logo === "number"
              ? ` · ${stats.stores_with_logo} with logos`
              : ""}
          </p>
        </Link>
        <Link
          to="/admin/photos"
          className="rounded-3xl border border-border bg-secondary/30 p-4 hover:border-primary/40"
        >
          <Camera className="mb-3 size-5 text-accent" />
          <p className="font-semibold">Photos</p>
          <p className="text-sm text-muted-foreground">{stats?.photo_sessions ?? 0} taken</p>
        </Link>
        {showApiTab ? (
          <Link
            to="/admin/settings"
            className="rounded-3xl border border-border bg-secondary/30 p-4 hover:border-primary/40"
          >
            <KeyRound className="mb-3 size-5 text-accent" />
            <p className="font-semibold">API status</p>
            <p className="text-sm text-muted-foreground">
              {stats?.freepik_configured ? "Magnific connected" : "Key missing"}
            </p>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

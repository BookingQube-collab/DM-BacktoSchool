import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  NamedCountBarChart,
  NamedCountDonutChart,
  StoreValueBarChart,
} from "@/components/admin/AdminCharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { NamedCount, StoreValueBucket } from "@/lib/admin-charts";
import {
  defaultRegistrationsFromDate,
  formatQar,
  todayISODate,
} from "@/lib/registration";

export const Route = createFileRoute("/admin/registrations")({
  component: AdminRegistrationsPage,
});

type Registration = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  nationality: string;
  address_zone: string;
  transaction_date: string;
  transaction_value: number;
  receipt_image_url: string | null;
  store_name: string;
  created_at: string;
};

type Store = { id: string; name: string };

type Aggregates = {
  total_value: number;
  by_store: StoreValueBucket[];
  by_nationality: NamedCount[];
  by_zone: NamedCount[];
};

type DeleteDialog =
  | { type: "one"; id: string; label: string }
  | { type: "bulk"; scope: "filter" | "all" }
  | null;

const selectClass =
  "flex h-9 min-w-40 rounded-md border border-input bg-transparent px-3 py-1 text-sm";

function AdminRegistrationsPage() {
  const [from, setFrom] = useState(defaultRegistrationsFromDate);
  const [to, setTo] = useState(todayISODate);
  const [storeId, setStoreId] = useState("");
  const [q, setQ] = useState("");
  const [nationality, setNationality] = useState("");
  const [zone, setZone] = useState("");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [nationalities, setNationalities] = useState<string[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const [rows, setRows] = useState<Registration[]>([]);
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);
  const [totalGuests, setTotalGuests] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialog, setDialog] = useState<DeleteDialog>(null);

  function buildFilterParams(overrides?: {
    from?: string;
    to?: string;
    storeId?: string;
    q?: string;
    nationality?: string;
    zone?: string;
    minValue?: string;
    maxValue?: string;
  }) {
    const nextFrom = overrides?.from ?? from;
    const nextTo = overrides?.to ?? to;
    const nextStoreId = overrides?.storeId ?? storeId;
    const nextQ = overrides?.q ?? q;
    const nextNationality = overrides?.nationality ?? nationality;
    const nextZone = overrides?.zone ?? zone;
    const nextMin = overrides?.minValue ?? minValue;
    const nextMax = overrides?.maxValue ?? maxValue;

    const qs = new URLSearchParams({ from: nextFrom, to: nextTo });
    if (nextStoreId) qs.set("store_id", nextStoreId);
    if (nextQ.trim()) qs.set("q", nextQ.trim());
    if (nextNationality) qs.set("nationality", nextNationality);
    if (nextZone) qs.set("zone", nextZone);
    if (nextMin.trim() !== "") qs.set("min_value", nextMin.trim());
    if (nextMax.trim() !== "") qs.set("max_value", nextMax.trim());
    return qs;
  }

  async function load(overrides?: Parameters<typeof buildFilterParams>[0]) {
    setLoading(true);
    setError(null);
    try {
      const qs = buildFilterParams(overrides);
      const res = await fetch(`/api/admin/registrations?${qs}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load registrations");
        return;
      }
      setRows((data.registrations as Registration[]) ?? []);
      setTotalGuests(
        typeof data.total_guests === "number" ? data.total_guests : null,
      );
      setAggregates((data.aggregates as Aggregates) ?? null);
      const facets = data.facets as
        | { nationalities?: string[]; zones?: string[] }
        | undefined;
      if (facets?.nationalities) setNationalities(facets.nationalities);
      if (facets?.zones) setZones(facets.zones);
    } catch {
      setError("Could not load registrations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/companies", { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setStores(
          ((data.companies as { id: string; name: string }[]) ?? []).map((c) => ({
            id: c.id,
            name: c.name,
          })),
        );
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function downloadCsv() {
    const qs = buildFilterParams();
    qs.set("format", "csv");
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

  async function confirmDelete() {
    if (!dialog) return;
    setDeleting(true);
    setError(null);
    try {
      let url = "/api/admin/registrations?";
      if (dialog.type === "one") {
        url += `id=${encodeURIComponent(dialog.id)}`;
      } else if (dialog.scope === "all") {
        url += "scope=all";
      } else {
        const qs = buildFilterParams();
        qs.set("scope", "filter");
        url += qs.toString();
      }

      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || "Delete failed";
        setError(msg);
        toast.error(msg);
        return;
      }
      const count = typeof data.deleted === "number" ? data.deleted : 0;
      toast.success(
        dialog.type === "one"
          ? "Registration deleted"
          : `Deleted ${count} registration${count === 1 ? "" : "s"}`,
      );
      setDialog(null);
      await load();
    } catch {
      setError("Could not delete");
      toast.error("Could not delete");
    } finally {
      setDeleting(false);
    }
  }

  const hasExtraFilters = Boolean(
    q.trim() ||
      nationality ||
      zone ||
      minValue.trim() ||
      maxValue.trim() ||
      storeId,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Registrations</h1>
          <p className="mt-2 text-muted-foreground">
            All guest receipts captured at the registration desk.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={downloadCsv}>
            <Download className="size-4" />
            Download CSV
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading || (rows.length === 0 && (totalGuests ?? 0) === 0)}
            onClick={() => setDialog({ type: "bulk", scope: "filter" })}
          >
            <Trash2 className="size-4" />
            Delete all…
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-3xl border border-border bg-secondary/40 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="min-w-[12rem] flex-1 space-y-2">
            <Label htmlFor="q">Search guest</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="q"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void load();
                }}
                className="pl-9"
                placeholder="Name, email, or mobile"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="store">Store</Label>
            <select
              id="store"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className={selectClass}
            >
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="nationality">Nationality</Label>
            <select
              id="nationality"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              className={selectClass}
            >
              <option value="">All nationalities</option>
              {nationalities.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="zone">Zone</Label>
            <select
              id="zone"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className={selectClass}
            >
              <option value="">All zones</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="min_value">Min value (QAR)</Label>
            <Input
              id="min_value"
              type="number"
              min={0}
              step="0.01"
              value={minValue}
              onChange={(e) => setMinValue(e.target.value)}
              className="w-32"
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_value">Max value (QAR)</Label>
            <Input
              id="max_value"
              type="number"
              min={0}
              step="0.01"
              value={maxValue}
              onChange={(e) => setMaxValue(e.target.value)}
              className="w-32"
              placeholder="Any"
            />
          </div>
          <Button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Apply filter"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => {
              const nextFrom = defaultRegistrationsFromDate();
              const nextTo = todayISODate();
              setFrom(nextFrom);
              setTo(nextTo);
              setStoreId("");
              setQ("");
              setNationality("");
              setZone("");
              setMinValue("");
              setMaxValue("");
              void load({
                from: nextFrom,
                to: nextTo,
                storeId: "",
                q: "",
                nationality: "",
                zone: "",
                minValue: "",
                maxValue: "",
              });
            }}
          >
            Last 30 days
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && rows.length > 0 && aggregates ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-border bg-secondary/40 p-4">
              <p className="text-xs font-semibold text-muted-foreground">
                Filtered count
              </p>
              <p className="mt-2 font-display text-2xl font-bold">
                {rows.length}
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-secondary/40 p-4">
              <p className="text-xs font-semibold text-muted-foreground">
                Total value
              </p>
              <p className="mt-2 font-display text-2xl font-bold">
                {formatQar(aggregates.total_value)}
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-secondary/40 p-4">
              <p className="text-xs font-semibold text-muted-foreground">
                Avg transaction
              </p>
              <p className="mt-2 font-display text-2xl font-bold">
                {formatQar(
                  rows.length ? aggregates.total_value / rows.length : 0,
                )}
              </p>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <StoreValueBarChart
              stores={aggregates.by_store.slice(0, 8)}
              heightClass="aspect-auto h-[180px] w-full"
            />
            <NamedCountDonutChart
              title="Nationality"
              subtitle="Filtered results"
              items={aggregates.by_nationality}
              heightClass="aspect-auto h-[180px] w-full"
            />
            <NamedCountBarChart
              title="By zone"
              subtitle="Filtered results"
              items={aggregates.by_zone}
              heightClass="aspect-auto h-[180px] w-full"
            />
          </div>
        </div>
      ) : null}

      {!loading && totalGuests !== null ? (
        <p className="text-sm text-muted-foreground">
          Showing {rows.length} matching
          {hasExtraFilters ? " filters" : " in this date range"} · {totalGuests}{" "}
          guest{totalGuests === 1 ? "" : "s"} total
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-secondary/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-semibold">Date</th>
              <th className="px-3 py-3 font-semibold">Guest</th>
              <th className="px-3 py-3 font-semibold">Mobile</th>
              <th className="px-3 py-3 font-semibold">Zone</th>
              <th className="px-3 py-3 font-semibold">Store</th>
              <th className="px-3 py-3 font-semibold">Value</th>
              <th className="px-3 py-3 font-semibold">Bill</th>
              <th className="px-3 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  {totalGuests === 0 ? (
                    <>
                      No guest registrations yet. Photo booth sessions do not create
                      registrations — use the desk flow at{" "}
                      <span className="font-medium text-foreground">/register</span>.
                    </>
                  ) : (
                    <>
                      No registrations match this filter
                      {totalGuests != null
                        ? ` (${totalGuests} guest${totalGuests === 1 ? "" : "s"} exist outside this filter). Try widening dates or clearing search filters.`
                        : "."}
                    </>
                  )}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border align-top">
                  <td className="px-3 py-3 whitespace-nowrap">{row.transaction_date}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium">
                      {row.first_name} {row.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{row.email}</p>
                    <p className="text-xs text-muted-foreground">{row.nationality}</p>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{row.mobile}</td>
                  <td className="px-3 py-3">{row.address_zone}</td>
                  <td className="px-3 py-3">{row.store_name}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {formatQar(row.transaction_value)}
                  </td>
                  <td className="px-3 py-3">
                    {row.receipt_image_url ? (
                      <a
                        href={row.receipt_image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-accent hover:underline"
                      >
                        <img
                          src={row.receipt_image_url}
                          alt=""
                          className="size-10 rounded-md object-cover border border-border"
                        />
                        View
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setDialog({
                          type: "one",
                          id: row.id,
                          label: `${row.first_name} ${row.last_name}`.trim(),
                        })
                      }
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={dialog != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog?.type === "one"
                ? "Delete this registration?"
                : "Delete registrations?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                {dialog?.type === "one" ? (
                  <p>
                    This permanently deletes{" "}
                    <span className="font-medium text-foreground">
                      {dialog.label || "this guest"}
                    </span>{" "}
                    and their receipt image. Photo booth sessions are not removed.
                  </p>
                ) : (
                  <>
                    <p>
                      This cannot be undone. Receipt images for deleted guests are
                      removed from storage.
                    </p>
                    <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3 text-foreground">
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="reg-delete-scope"
                          className="mt-1"
                          checked={dialog?.scope === "filter"}
                          onChange={() =>
                            setDialog({ type: "bulk", scope: "filter" })
                          }
                        />
                        <span>
                          Current filter only ({rows.length} shown
                          {hasExtraFilters ? ", with filters" : ""})
                        </span>
                      </label>
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="reg-delete-scope"
                          className="mt-1"
                          checked={dialog?.scope === "all"}
                          onChange={() =>
                            setDialog({ type: "bulk", scope: "all" })
                          }
                        />
                        <span>
                          All registrations
                          {totalGuests != null ? ` (${totalGuests} total)` : ""}
                        </span>
                      </label>
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

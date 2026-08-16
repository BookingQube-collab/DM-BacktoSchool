import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  NamedCountBarChart,
  NamedCountDonutChart,
  StoreValueBarChart,
} from "@/components/admin/AdminCharts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { NATIONALITIES } from "@/lib/countries";
import { useI18n } from "@/lib/i18n";
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
  store_id: string | null;
  store_name: string;
  created_at: string;
};

type EditForm = {
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  nationality: string;
  address_zone: string;
  transaction_date: string;
  company_id: string;
  transaction_value: string;
};

function formFromRow(row: Registration): EditForm {
  return {
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    mobile: row.mobile,
    nationality: row.nationality,
    address_zone: row.address_zone,
    transaction_date: row.transaction_date,
    company_id: row.store_id ?? "",
    transaction_value: String(row.transaction_value ?? ""),
  };
}

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
  const { t } = useI18n();
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
  const [editRow, setEditRow] = useState<Registration | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
        setError(data.error || t("regLoadFail"));
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
      setError(t("regLoadError"));
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
      setError(t("dashCsvFail"));
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
        const msg = data.error || t("commonDeleteFailed");
        setError(msg);
        toast.error(msg);
        return;
      }
      const count = typeof data.deleted === "number" ? data.deleted : 0;
      toast.success(
        dialog.type === "one"
          ? t("regDeletedOne")
          : t("regDeletedMany", {
              count,
              plural: count === 1 ? "" : "s",
            }),
      );
      setDialog(null);
      await load();
    } catch {
      setError(t("commonCouldNotDelete"));
      toast.error(t("commonCouldNotDelete"));
    } finally {
      setDeleting(false);
    }
  }

  function openEdit(row: Registration) {
    setEditRow(row);
    setEditForm(formFromRow(row));
    setEditError(null);
  }

  function closeEdit() {
    if (saving) return;
    setEditRow(null);
    setEditForm(null);
    setEditError(null);
  }

  function updateEdit<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setEditForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function validateEdit(form: EditForm): string | null {
    if (!form.company_id) return t("registerErrSelectStore");
    const value = Number(form.transaction_value);
    if (!Number.isFinite(value) || value < 0) return t("registerErrTxnValue");
    if (!form.first_name.trim()) return t("registerErrFirstName");
    if (!form.last_name.trim()) return t("registerErrLastName");
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      return t("registerErrEmail");
    }
    if (form.mobile.replace(/\D/g, "").length < 8) {
      return t("registerErrMobile");
    }
    if (!form.nationality) return t("registerErrNationality");
    if (!form.address_zone.trim()) return t("registerErrZone");
    if (!form.transaction_date) return t("registerErrDate");
    return null;
  }

  async function saveEdit() {
    if (!editRow || !editForm) return;
    const msg = validateEdit(editForm);
    if (msg) {
      setEditError(msg);
      return;
    }

    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch("/api/admin/registrations", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editRow.id,
          ...editForm,
          transaction_value: Number(editForm.transaction_value),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fail = data.error || t("regSaveFailed");
        setEditError(fail);
        toast.error(fail);
        return;
      }
      toast.success(t("regSaved"));
      setEditRow(null);
      setEditForm(null);
      await load();
    } catch {
      const fail = t("regSaveFailed");
      setEditError(fail);
      toast.error(fail);
    } finally {
      setSaving(false);
    }
  }

  const editNationalityOptions = (() => {
    const names = NATIONALITIES.map((n) => n.name);
    const current = editForm?.nationality?.trim();
    if (current && !names.includes(current)) return [current, ...names];
    return names;
  })();

  const editStoreOptions = (() => {
    if (
      editForm?.company_id &&
      !stores.some((s) => s.id === editForm.company_id)
    ) {
      return [
        {
          id: editForm.company_id,
          name: editRow?.store_name || t("regUnassigned"),
        },
        ...stores,
      ];
    }
    return stores;
  })();

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
          <h1 className="font-display text-3xl font-bold">{t("regTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("regSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={downloadCsv}>
            <Download className="size-4" />
            {t("commonDownloadCsv")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading || (rows.length === 0 && (totalGuests ?? 0) === 0)}
            onClick={() => setDialog({ type: "bulk", scope: "filter" })}
          >
            <Trash2 className="size-4" />
            {t("regDeleteAll")}
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-3xl border border-border bg-secondary/40 p-4">
        <div className="flex flex-wrap items-end gap-3">
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
          <div className="min-w-[12rem] flex-1 space-y-2">
            <Label htmlFor="q">{t("regSearchGuest")}</Label>
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
                placeholder={t("regSearchPlaceholder")}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="store">{t("commonStore")}</Label>
            <select
              id="store"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className={selectClass}
            >
              <option value="">{t("regAllStores")}</option>
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
            <Label htmlFor="nationality">{t("commonNationality")}</Label>
            <select
              id="nationality"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              className={selectClass}
            >
              <option value="">{t("regAllNationalities")}</option>
              {nationalities.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="zone">{t("commonZone")}</Label>
            <select
              id="zone"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className={selectClass}
            >
              <option value="">{t("regAllZones")}</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="min_value">{t("regMinValue")}</Label>
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
            <Label htmlFor="max_value">{t("regMaxValue")}</Label>
            <Input
              id="max_value"
              type="number"
              min={0}
              step="0.01"
              value={maxValue}
              onChange={(e) => setMaxValue(e.target.value)}
              className="w-32"
              placeholder={t("regMaxAny")}
            />
          </div>
          <Button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? t("commonLoading") : t("commonApplyFilter")}
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
            {t("regLast30")}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && rows.length > 0 && aggregates ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-border bg-secondary/40 p-4">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("regFilteredCount")}
              </p>
              <p className="mt-2 font-display text-2xl font-bold">
                {rows.length}
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-secondary/40 p-4">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("regTotalValue")}
              </p>
              <p className="mt-2 font-display text-2xl font-bold">
                {formatQar(aggregates.total_value)}
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-secondary/40 p-4">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("regAvgTxn")}
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
              title={t("commonNationality")}
              subtitle={t("chartFiltered")}
              items={aggregates.by_nationality}
              heightClass="aspect-auto h-[180px] w-full"
            />
            <NamedCountBarChart
              title="By zone"
              subtitle={t("chartFiltered")}
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
              <th className="px-3 py-3 font-semibold">{t("regColDate")}</th>
              <th className="px-3 py-3 font-semibold">{t("regColGuest")}</th>
              <th className="px-3 py-3 font-semibold">{t("regColMobile")}</th>
              <th className="px-3 py-3 font-semibold">{t("regColZone")}</th>
              <th className="px-3 py-3 font-semibold">{t("regColStore")}</th>
              <th className="px-3 py-3 font-semibold">Value</th>
              <th className="px-3 py-3 font-semibold">{t("regColBill")}</th>
              <th className="px-3 py-3 font-semibold">{t("regColActions")}</th>
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
                        className="inline-flex flex-col items-center gap-1 text-accent hover:underline"
                      >
                        <img
                          src={row.receipt_image_url}
                          alt=""
                          className="size-10 rounded-md object-cover border border-border"
                        />
                        {t("commonView")}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="size-3.5" />
                        {t("commonEdit")}
                      </Button>
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
                        {t("commonDelete")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={editRow != null}
        onOpenChange={(open) => {
          if (!open) closeEdit();
        }}
      >
        <DialogContent className="max-h-[min(90vh,44rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("regEditTitle")}</DialogTitle>
            <DialogDescription>{t("regEditSubtitle")}</DialogDescription>
          </DialogHeader>
          {editForm ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit_first_name">{t("registerFirstName")}</Label>
                <Input
                  id="edit_first_name"
                  value={editForm.first_name}
                  onChange={(e) => updateEdit("first_name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_last_name">{t("registerLastName")}</Label>
                <Input
                  id="edit_last_name"
                  value={editForm.last_name}
                  onChange={(e) => updateEdit("last_name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_email">{t("registerEmail")}</Label>
                <Input
                  id="edit_email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => updateEdit("email", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_mobile">{t("registerMobile")}</Label>
                <Input
                  id="edit_mobile"
                  type="tel"
                  value={editForm.mobile}
                  onChange={(e) => updateEdit("mobile", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_nationality">
                  {t("commonNationality")}
                </Label>
                <select
                  id="edit_nationality"
                  value={editForm.nationality}
                  onChange={(e) => updateEdit("nationality", e.target.value)}
                  className={`${selectClass} w-full`}
                >
                  <option value="">{t("registerSelectNationality")}</option>
                  {editNationalityOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_zone">{t("registerAddressZone")}</Label>
                <Input
                  id="edit_zone"
                  value={editForm.address_zone}
                  onChange={(e) => updateEdit("address_zone", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_store">{t("commonStore")}</Label>
                <select
                  id="edit_store"
                  value={editForm.company_id}
                  onChange={(e) => updateEdit("company_id", e.target.value)}
                  className={`${selectClass} w-full`}
                >
                  <option value="">{t("registerErrSelectStore")}</option>
                  {editStoreOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_value">{t("registerTxnValue")}</Label>
                <Input
                  id="edit_value"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editForm.transaction_value}
                  onChange={(e) =>
                    updateEdit("transaction_value", e.target.value)
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit_date">{t("registerTxnDate")}</Label>
                <Input
                  id="edit_date"
                  type="date"
                  value={editForm.transaction_date}
                  onChange={(e) =>
                    updateEdit("transaction_date", e.target.value)
                  }
                />
              </div>
            </div>
          ) : null}
          {editError ? (
            <p className="text-sm text-destructive">{editError}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={closeEdit}
            >
              {t("commonCancel")}
            </Button>
            <Button
              type="button"
              disabled={saving || !editForm}
              onClick={() => void saveEdit()}
            >
              {saving ? t("commonSaving") : t("commonSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                ? t("regDeleteOneTitle")
                : t("regDeleteBulkTitle")}
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
            <AlertDialogCancel disabled={deleting}>{t("commonCancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? t("commonDeleting") : t("commonDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

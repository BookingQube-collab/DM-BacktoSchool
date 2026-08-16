import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LogoCoverageBar, NamedCountBarChart } from "@/components/admin/AdminCharts";
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
import { humanizeFilename } from "@/lib/image";
import { fileToDownscaledDataUrl } from "@/lib/photo";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin/companies")({
  component: AdminCompaniesPage,
});

type Company = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  logo_path: string | null;
  logo_url: string | null;
};

type BulkDraft = {
  key: string;
  name: string;
  preview: string;
  logo_image: string;
};

function AdminCompaniesPage() {
  const { t } = useI18n();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [singlePreview, setSinglePreview] = useState<string | null>(null);
  const [singleLogo, setSingleLogo] = useState<string | null>(null);
  const [bulkDrafts, setBulkDrafts] = useState<BulkDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const singleFileRef = useRef<HTMLInputElement>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);
  const replaceFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function load() {
    const res = await fetch("/api/admin/companies", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load companies");
      return;
    }
    setCompanies(data.companies as Company[]);
  }

  useEffect(() => {
    void load();
  }, []);

  const logoStats = useMemo(() => {
    const withLogo = companies.filter((c) => Boolean(c.logo_url)).length;
    return {
      withLogo,
      withoutLogo: Math.max(0, companies.length - withLogo),
    };
  }, [companies]);

  const activeBreakdown = useMemo(
    () => [
      {
        name: t("storesActive"),
        count: companies.filter((c) => c.is_active).length,
      },
      {
        name: t("storesInactive"),
        count: companies.filter((c) => !c.is_active).length,
      },
    ].filter((x) => x.count > 0),
    [companies, t],
  );

  async function onSingleFile(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      setSingleLogo(dataUrl);
      setSinglePreview(dataUrl);
      if (!name.trim()) setName(humanizeFilename(file.name));
    } catch {
      setError("Could not read store image");
    }
  }

  async function onBulkFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    try {
      const drafts: BulkDraft[] = [];
      const seen = new Set<string>();
      const existingNames = new Set(
        companies.map((c) => c.name.trim().toLowerCase()),
      );
      const skipped: string[] = [];

      for (const file of Array.from(files)) {
        const name = humanizeFilename(file.name) || "Store";
        const key = name.trim().toLowerCase();
        if (seen.has(key) || existingNames.has(key)) {
          skipped.push(name);
          continue;
        }
        seen.add(key);
        const dataUrl = await fileToDownscaledDataUrl(file);
        drafts.push({
          key: `${file.name}-${file.size}-${file.lastModified}`,
          name,
          preview: dataUrl,
          logo_image: dataUrl,
        });
      }
      setBulkDrafts(drafts);
      if (skipped.length) {
        setError(
          `Skipped duplicate names: ${[...new Set(skipped)].join(", ")}`,
        );
      }
    } catch {
      setError("Could not read one or more store images");
    }
  }

  async function addCompany(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const trimmed = name.trim();
      if (
        companies.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())
      ) {
        setError(`Store already exists: ${trimmed}`);
        return;
      }
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          logo_image: singleLogo || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not add company");
        return;
      }
      setName("");
      setSingleLogo(null);
      setSinglePreview(null);
      if (singleFileRef.current) singleFileRef.current.value = "";
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveBulk() {
    if (!bulkDrafts.length) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stores: bulkDrafts.map((d) => ({
            name: d.name,
            logo_image: d.logo_image,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Bulk upload failed");
        return;
      }
      setBulkDrafts([]);
      if (bulkFileRef.current) bulkFileRef.current.value = "";
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(company: Company) {
    const res = await fetch("/api/admin/companies", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: company.id, is_active: !company.is_active }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Update failed");
      return;
    }
    await load();
  }

  async function renameCompany(company: Company, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === company.name) return;
    const res = await fetch("/api/admin/companies", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: company.id, name: trimmed }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Rename failed");
      return;
    }
    await load();
  }

  async function replaceLogo(company: Company, file: File | undefined) {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const logo_image = await fileToDownscaledDataUrl(file);
      const res = await fetch("/api/admin/companies", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: company.id, logo_image }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not replace image");
        return;
      }
      await load();
    } catch {
      setError("Could not read replacement image");
    } finally {
      setSaving(false);
    }
  }

  async function removeCompany(id: string) {
    if (!confirm(t("storesConfirmDelete"))) return;
    const res = await fetch(`/api/admin/companies?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json();
      const msg = data.error || "Delete failed";
      setError(msg);
      toast.error(msg);
      return;
    }
    toast.success("Store deleted");
    await load();
  }

  async function removeAllStores() {
    setDeletingAll(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/companies?scope=all", {
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
      toast.success(`Deleted ${count} store${count === 1 ? "" : "s"}`);
      setConfirmDeleteAll(false);
      await load();
    } catch {
      setError("Could not delete stores");
      toast.error("Could not delete stores");
    } finally {
      setDeletingAll(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{t("storesTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("storesSubtitle")}</p>
        </div>
        <Button
          type="button"
          variant="destructive"
          disabled={!companies.length || saving || deletingAll}
          onClick={() => setConfirmDeleteAll(true)}
        >
          <Trash2 className="size-4" />
          Delete all stores
        </Button>
      </div>

      {companies.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <LogoCoverageBar
            withLogo={logoStats.withLogo}
            withoutLogo={logoStats.withoutLogo}
          />
          <NamedCountBarChart
            title="Store status"
            subtitle={`${companies.length} stores configured`}
            items={activeBreakdown}
            heightClass="aspect-auto h-[160px] w-full"
          />
        </div>
      ) : null}

      <section className="space-y-4 rounded-3xl border border-border bg-secondary/40 p-5">
        <h2 className="font-display text-xl font-semibold">Add one store</h2>
        <form onSubmit={addCompany} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <button
              type="button"
              onClick={() => singleFileRef.current?.click()}
              className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-background/40 text-xs text-muted-foreground hover:border-accent"
            >
              {singlePreview ? (
                <img
                  src={singlePreview}
                  alt=""
                  className="h-full w-full bg-white object-contain p-1.5"
                />
              ) : (
                "Add image"
              )}
            </button>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="company">Store name</Label>
                <Input
                  id="company"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Lulu"
                  required
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => singleFileRef.current?.click()}
                >
                  {singlePreview ? "Change image" : "Choose image"}
                </Button>
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? "Saving…" : "Add store"}
                </Button>
              </div>
            </div>
          </div>
          <input
            ref={singleFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void onSingleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </form>
      </section>

      <section className="space-y-4 rounded-3xl border border-border bg-secondary/40 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Bulk upload</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select multiple images — names default from filenames, then edit and
              save all.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => bulkFileRef.current?.click()}
          >
            Choose images
          </Button>
          <input
            ref={bulkFileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void onBulkFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {bulkDrafts.length > 0 ? (
          <div className="space-y-3">
            <ul className="space-y-3">
              {bulkDrafts.map((draft, idx) => (
                <li
                  key={draft.key}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background/30 p-3"
                >
                  <img
                    src={draft.preview}
                    alt=""
                    className="size-16 rounded-xl border border-border bg-white object-contain p-1"
                  />
                  <Input
                    value={draft.name}
                    onChange={(e) =>
                      setBulkDrafts((prev) =>
                        prev.map((d, i) =>
                          i === idx ? { ...d, name: e.target.value } : d,
                        ),
                      )
                    }
                    className="min-w-40 flex-1"
                    placeholder="Store name"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setBulkDrafts((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void saveBulk()}
                disabled={saving || bulkDrafts.some((d) => !d.name.trim())}
              >
                {saving ? "Saving…" : `Save all (${bulkDrafts.length})`}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setBulkDrafts([])}
                disabled={saving}
              >
                Clear
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Current stores</h2>
        <ul className="space-y-3">
          {companies.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No stores yet. Add one above or bulk-upload logos.
            </li>
          ) : (
            companies.map((company) => (
              <li
                key={company.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-3"
              >
                <div className="size-16 overflow-hidden rounded-xl border border-border bg-white p-1">
                  {company.logo_url ? (
                    <img
                      src={company.logo_url}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-40 flex-1 space-y-1">
                  <Input
                    defaultValue={company.name}
                    onBlur={(e) => void renameCompany(company, e.target.value)}
                    className="font-semibold"
                  />
                  <p className="text-xs text-muted-foreground">
                    {company.is_active ? "Active on desk" : "Hidden"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => replaceFileRefs.current[company.id]?.click()}
                    disabled={saving}
                  >
                    Replace image
                  </Button>
                  <input
                    ref={(el) => {
                      replaceFileRefs.current[company.id] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void replaceLogo(company, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void toggleActive(company)}
                  >
                    {company.is_active ? "Hide" : "Show"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void removeCompany(company.id)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <AlertDialog
        open={confirmDeleteAll}
        onOpenChange={(open) => {
          if (!open && !deletingAll) setConfirmDeleteAll(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all stores?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every store and logo ({companies.length} total). Guest
              registrations keep their data; store links become unassigned. This
              does not delete registrations or photos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletingAll}
              onClick={(e) => {
                e.preventDefault();
                void removeAllStores();
              }}
            >
              {deletingAll ? "Deleting…" : "Delete all stores"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

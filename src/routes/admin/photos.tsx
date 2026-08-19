import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PrintCountdownOverlay } from "@/components/PrintCountdownOverlay";
import {
  NamedCountDonutChart,
  PhotosByDayChart,
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
import type { DayBucket, NamedCount } from "@/lib/admin-charts";
import { todayISODate } from "@/lib/registration";
import { professionTitleById } from "@/lib/professions";
import { useI18n } from "@/lib/i18n";
import { followPrintPayload, guestPrintError } from "@/lib/print-client";

export const Route = createFileRoute("/admin/photos")({
  component: AdminPhotosPage,
});

type PhotoSession = {
  id: string;
  profession_id: string;
  profession_title: string;
  image_url: string;
  image_path: string | null;
  guest_id: string | null;
  created_at: string;
};

type ReprintState = "idle" | "printing" | "done" | "error";

type DeleteDialog =
  | { type: "one"; id: string; label: string }
  | { type: "bulk"; scope: "filter" | "all" }
  | null;

function formatTakenAt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function AdminPhotosPage() {
  const { t, locale } = useI18n();
  const [from, setFrom] = useState(todayISODate());
  const [to, setTo] = useState(todayISODate());
  const [rows, setRows] = useState<PhotoSession[]>([]);
  const [byProfession, setByProfession] = useState<NamedCount[]>([]);
  const [byDay, setByDay] = useState<DayBucket[]>([]);
  const [totalInRange, setTotalInRange] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialog, setDialog] = useState<DeleteDialog>(null);
  const [reprintById, setReprintById] = useState<Record<string, ReprintState>>(
    {},
  );
  const [reprintErrorById, setReprintErrorById] = useState<
    Record<string, string>
  >({});
  const [reprintPrinterById, setReprintPrinterById] = useState<
    Record<string, string>
  >({});
  const [showPrintOverlay, setShowPrintOverlay] = useState(false);
  const [countdownSec, setCountdownSec] = useState(60);
  const [printPhase, setPrintPhase] = useState<"sending" | "printing">(
    "sending",
  );
  const countdownIntervalRef = useRef<number | null>(null);
  const countdownRemainingRef = useRef(0);
  const countdownResolveRef = useRef<(() => void) | null>(null);

  const clearCountdown = useCallback(() => {
    if (countdownIntervalRef.current != null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    const resolve = countdownResolveRef.current;
    countdownResolveRef.current = null;
    countdownRemainingRef.current = 0;
    resolve?.();
  }, []);

  const dismissPrintOverlay = useCallback(() => {
    clearCountdown();
    setShowPrintOverlay(false);
  }, [clearCountdown]);

  const startPrintCountdown = useCallback(() => {
    clearCountdown();
    countdownRemainingRef.current = 60;
    setCountdownSec(60);
    setPrintPhase("printing");
    setShowPrintOverlay(true);
    const done = new Promise<void>((resolve) => {
      countdownResolveRef.current = resolve;
    });
    countdownIntervalRef.current = window.setInterval(() => {
      const next = countdownRemainingRef.current - 1;
      countdownRemainingRef.current = next;
      setCountdownSec(Math.max(0, next));
      if (next <= 0) {
        if (countdownIntervalRef.current != null) {
          window.clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        const resolve = countdownResolveRef.current;
        countdownResolveRef.current = null;
        resolve?.();
      }
    }, 1000);
    return done;
  }, [clearCountdown]);

  useEffect(() => {
    return () => clearCountdown();
  }, [clearCountdown]);

  async function load(nextFrom = from, nextTo = to) {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from: nextFrom, to: nextTo });
      const res = await fetch(`/api/admin/photos?${qs}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load photos");
        return;
      }
      setRows((data.photos as PhotoSession[]) ?? []);
      const aggregates = data.aggregates as
        | { by_profession?: NamedCount[]; by_day?: DayBucket[] }
        | undefined;
      setByProfession(aggregates?.by_profession ?? []);
      setByDay(aggregates?.by_day ?? []);
      setTotalInRange(
        typeof data.total_in_range === "number" ? data.total_in_range : null,
      );
    } catch {
      setError("Could not load photos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reprint(sessionId: string) {
    setReprintById((prev) => ({ ...prev, [sessionId]: "printing" }));
    setReprintErrorById((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setReprintPrinterById((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setPrintPhase("sending");
    setShowPrintOverlay(true);
    setCountdownSec(60);
    let countdownDone: Promise<void> = Promise.resolve();
    try {
      const res = await fetch("/api/admin/reprint", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        printer_name?: string;
        queued?: boolean;
        jobId?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `Reprint failed (${res.status})`);
      }
      await followPrintPayload(data, {
        onAccepted: () => {
          countdownDone = startPrintCountdown();
        },
      });
      await countdownDone;
      if (data.printer_name) {
        setReprintPrinterById((prev) => ({
          ...prev,
          [sessionId]: data.printer_name!,
        }));
      }
      setShowPrintOverlay(false);
      setReprintById((prev) => ({ ...prev, [sessionId]: "done" }));
      window.setTimeout(() => {
        setReprintById((prev) => ({ ...prev, [sessionId]: "idle" }));
      }, 3500);
    } catch (e) {
      dismissPrintOverlay();
      const message = guestPrintError(
        e instanceof Error ? e.message : t("photosReachFail"),
      );
      setReprintById((prev) => ({ ...prev, [sessionId]: "error" }));
      setReprintErrorById((prev) => ({ ...prev, [sessionId]: message }));
      window.setTimeout(() => {
        setReprintById((prev) => ({ ...prev, [sessionId]: "idle" }));
      }, 8000);
    }
  }

  function reprintLabel(state: ReprintState | undefined) {
    if (state === "printing") return t("photosPrinting");
    if (state === "done") return t("photosSent");
    if (state === "error") return t("commonRetry");
    return t("photosReprint");
  }

  function reprintStatusText(
    state: ReprintState,
    err: string | undefined,
    printer: string | undefined,
  ): string | null {
    if (state === "printing") return t("photosSending");
    if (state === "done") {
      return printer ? t("photosSentTo", { printer }) : t("photosSentPrinter");
    }
    if (err) return err;
    return null;
  }

  async function confirmDelete() {
    if (!dialog) return;
    setDeleting(true);
    setError(null);
    try {
      let url = "/api/admin/photos?";
      if (dialog.type === "one") {
        url += `id=${encodeURIComponent(dialog.id)}`;
      } else if (dialog.scope === "all") {
        url += "scope=all";
      } else {
        url += new URLSearchParams({
          scope: "filter",
          from,
          to,
        }).toString();
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
          ? "Photo deleted"
          : `Deleted ${count} photo${count === 1 ? "" : "s"}`,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{t("photosTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("photosSubtitle")}</p>
        </div>
        <Button
          type="button"
          variant="destructive"
          disabled={loading}
          onClick={() => setDialog({ type: "bulk", scope: "filter" })}
        >
          <Trash2 className="size-4" />
          {t("regDeleteAll")}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-3xl border border-border bg-secondary/40 p-4">
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
        <Button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Apply filter"}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && (byProfession.length > 0 || byDay.some((d) => d.count > 0)) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <NamedCountDonutChart
            title="By profession"
            subtitle={
              totalInRange != null
                ? `${totalInRange} photo${totalInRange === 1 ? "" : "s"} in range`
                : "Current date filter"
            }
            items={byProfession.map((item) => ({
              ...item,
              name: professionTitleById(item.name, locale, item.name),
            }))}
          />
          <PhotosByDayChart days={byDay} />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-secondary/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-semibold">Photo</th>
              <th className="px-3 py-3 font-semibold">Profession</th>
              <th className="px-3 py-3 font-semibold">Taken</th>
              <th className="px-3 py-3 font-semibold">Reprint</th>
              <th className="px-3 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No photos found for this filter.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const state = reprintById[row.id] ?? "idle";
                const reprintErr = reprintErrorById[row.id];
                const reprintPrinter = reprintPrinterById[row.id];
                const statusText = reprintStatusText(
                  state,
                  reprintErr,
                  reprintPrinter,
                );
                return (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="px-3 py-3">
                      <a
                        href={row.image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-accent hover:underline"
                      >
                        <img
                          src={row.image_url}
                          alt=""
                          className="size-14 rounded-md object-cover border border-border"
                        />
                        View
                      </a>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium">
                        {professionTitleById(row.profession_id, locale, row.profession_title)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.profession_id}
                      </p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {formatTakenAt(row.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={state === "error" ? "destructive" : "default"}
                          disabled={state === "printing" || showPrintOverlay}
                          onClick={() => void reprint(row.id)}
                        >
                          <Printer className="size-4" />
                          {reprintLabel(state)}
                        </Button>
                        {statusText ? (
                          <p
                            className={
                              state === "error" || reprintErr
                                ? "max-w-[16rem] text-xs text-destructive"
                                : "max-w-[16rem] text-xs text-muted-foreground"
                            }
                          >
                            {statusText}
                          </p>
                        ) : null}
                      </div>
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
                            label: row.profession_title,
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })
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
              {dialog?.type === "one" ? "Delete this photo?" : "Delete photos?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                {dialog?.type === "one" ? (
                  <p>
                    Permanently delete the{" "}
                    <span className="font-medium text-foreground">
                      {dialog.label}
                    </span>{" "}
                    session and its file in storage.
                  </p>
                ) : (
                  <>
                    <p>
                      This cannot be undone. Matching Future ID images are removed
                      from storage.
                    </p>
                    <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3 text-foreground">
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="photo-delete-scope"
                          className="mt-1"
                          checked={dialog?.scope === "filter"}
                          onChange={() =>
                            setDialog({ type: "bulk", scope: "filter" })
                          }
                        />
                        <span>
                          Current date filter only ({rows.length} shown)
                        </span>
                      </label>
                      <label className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="photo-delete-scope"
                          className="mt-1"
                          checked={dialog?.scope === "all"}
                          onChange={() =>
                            setDialog({ type: "bulk", scope: "all" })
                          }
                        />
                        <span>All photos (entire event)</span>
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
      {showPrintOverlay ? (
        <PrintCountdownOverlay seconds={countdownSec} phase={printPhase} />
      ) : null}
    </div>
  );
}

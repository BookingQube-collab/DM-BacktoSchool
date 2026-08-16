import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { fileToLogoDataUrl } from "@/lib/photo";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
});

type Settings = {
  freepik_api_key: string;
  freepik_api_key_set: boolean;
  event_name: string;
  admin_username: string;
  admin_password_set: boolean;
  doha_mall_logo_path: string;
  doha_mall_logo_url: string;
  printer_name: string;
  printer_host: string;
  booth_print_base_url: string;
};

function AdminSettingsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [freepik, setFreepik] = useState("");
  const [eventName, setEventName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [printerName, setPrinterName] = useState("");
  const [printerHost, setPrinterHost] = useState("");
  const [boothPrintBaseUrl, setBoothPrintBaseUrl] = useState("");
  const [detectedSelphyIp, setDetectedSelphyIp] = useState<string | null>(null);
  const [detectedPrinters, setDetectedPrinters] = useState<
    {
      name: string;
      status: string;
      ready: boolean;
      workOffline: boolean;
      driverName?: string;
      portName?: string;
      softDriver?: boolean;
    }[]
  >([]);
  const [printersHint, setPrintersHint] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [pendingLogo, setPendingLogo] = useState<string | null>(null);
  const [clearLogo, setClearLogo] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [purgePassword, setPurgePassword] = useState("");
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [purging, setPurging] = useState(false);

  function applySettings(s: Settings) {
    setSettings(s);
    setFreepik(s.freepik_api_key_set ? s.freepik_api_key : "");
    setEventName(s.event_name);
    setUsername(s.admin_username);
    setPrinterName(s.printer_name || "Canon SELPHY CP1500");
    setPrinterHost(s.printer_host || "");
    setBoothPrintBaseUrl(s.booth_print_base_url || "");
    setLogoPreview(s.doha_mall_logo_url || null);
    setPendingLogo(null);
    setClearLogo(false);
  }

  async function loadPrinters() {
    try {
      const res = await fetch("/api/admin/printers", { credentials: "include" });
      const data = (await res.json()) as {
        printers?: {
          name: string;
          status: string;
          ready: boolean;
          workOffline: boolean;
          driverName?: string;
          portName?: string;
          softDriver?: boolean;
        }[];
        hint?: string;
        error?: string;
        selphy_ip?: string | null;
      };
      if (!res.ok) {
        setPrintersHint(data.error || "Could not list printers");
        setDetectedPrinters([]);
        setDetectedSelphyIp(null);
        return;
      }
      setDetectedPrinters(data.printers || []);
      setPrintersHint(data.hint || null);
      setDetectedSelphyIp(data.selphy_ip?.trim() || null);
    } catch {
      setPrintersHint("Could not list printers on this host");
      setDetectedPrinters([]);
      setDetectedSelphyIp(null);
    }
  }

  async function load() {
    const res = await fetch("/api/admin/settings", { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load settings");
      return;
    }
    applySettings(data as Settings);
    void loadPrinters();
  }

  useEffect(() => {
    void load();
  }, []);

  async function onLogoFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      // Preserve PNG/WebP alpha — JPEG downscale turns transparent pixels black.
      const dataUrl = await fileToLogoDataUrl(file);
      setPendingLogo(dataUrl);
      setLogoPreview(dataUrl);
      setClearLogo(false);
    } catch {
      setError("Could not read logo image");
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const body: Record<string, string | boolean> = {
        event_name: eventName,
        admin_username: username,
        printer_name: printerName,
        printer_host: printerHost.trim(),
        booth_print_base_url: boothPrintBaseUrl.trim(),
      };
      if (freepik && !freepik.includes("•")) {
        body.freepik_api_key = freepik;
      }
      if (password) body.admin_password = password;
      if (clearLogo) body.clear_doha_mall_logo = true;
      else if (pendingLogo) body.doha_mall_logo_image = pendingLogo;

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      setPassword("");
      setMessage("Settings saved");
      applySettings(data.settings as Settings);
    } catch {
      setError("Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  const resolvedPrinter =
    printerName.trim() || "Canon SELPHY CP1500";
  const kioskHint = `chrome.exe --kiosk "${typeof window !== "undefined" ? window.location.origin : "https://your-booth-url"}"`;

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-3xl font-bold">{t("settingsTitle")}</h1>
      <p className="mt-2 text-muted-foreground">{t("settingsSubtitle")}</p>

      <form onSubmit={onSave} className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="event_name">Event name</Label>
          <Input
            id="event_name"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
          />
        </div>

        <div className="space-y-3 rounded-xl border border-border p-4">
          <div>
            <Label>Doha Mall logo</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Shown on the Future ID card and print. Use a PNG/WebP with a
              transparent background (not a black box). Re-upload if an older
              save flattened the logo to black.
            </p>
          </div>
          {logoPreview ? (
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 max-w-[11rem] items-center justify-center rounded-lg px-2 py-1.5 ring-1 ring-black/10"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #d4d4d8 25%, transparent 25%), linear-gradient(-45deg, #d4d4d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d8 75%), linear-gradient(-45deg, transparent 75%, #d4d4d8 75%)",
                  backgroundSize: "12px 12px",
                  backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
                  backgroundColor: "#f4f4f5",
                }}
              >
                <img
                  src={logoPreview}
                  alt="Doha Mall logo preview"
                  className="h-12 max-w-[9.5rem] object-contain"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setClearLogo(true);
                  setPendingLogo(null);
                  setLogoPreview(null);
                }}
              >
                Remove
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No logo uploaded yet.</p>
          )}
          <Input
            id="doha_mall_logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void onLogoFile(e.target.files?.[0])}
          />
        </div>

        <div className="space-y-2 rounded-xl border border-border p-4">
          <Label htmlFor="printer_name">Printer name</Label>
          <Input
            id="printer_name"
            value={printerName}
            onChange={(e) => setPrinterName(e.target.value)}
            placeholder="Canon SELPHY CP1500"
          />
          <p className="text-xs text-muted-foreground">
            Target queue for silent booth Print and Admin → Photos Reprint.
            Matching is case-insensitive (e.g. SELPHY / CP1500 / Evolis).
            Canon SELPHY CP1500 may appear as USB (Canon driver) or Wi‑Fi
            (Microsoft IPP/WSD). Wi‑Fi SELPHY prints via direct IPP when the
            printer is on the same network — keep{" "}
            <strong>Canon SELPHY CP1500</strong> selected for photo prints.
            Evolis Primacy 2 is for CR80 card printing only.
          </p>
          <div className="space-y-2">
            <Label htmlFor="printer_host">Printer IP (Wi‑Fi SELPHY)</Label>
            <Input
              id="printer_host"
              value={printerHost}
              onChange={(e) => setPrinterHost(e.target.value)}
              placeholder={detectedSelphyIp || "192.168.18.108"}
              inputMode="decimal"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Use when Windows still lists an old SELPHY address after
              DHCP changed. Leave blank to auto-detect (ARP + live IPP probe).
              {detectedSelphyIp ? (
                <>
                  {" "}
                  Detected now:{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                    onClick={() => setPrinterHost(detectedSelphyIp)}
                    title="Use detected IP"
                  >
                    {detectedSelphyIp}
                  </button>
                </>
              ) : (
                " No live SELPHY IP detected yet — power on the printer on the booth Wi‑Fi."
              )}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="booth_print_base_url">
              Booth print server URL (optional)
            </Label>
            <Input
              id="booth_print_base_url"
              value={boothPrintBaseUrl}
              onChange={(e) => setBoothPrintBaseUrl(e.target.value)}
              placeholder="192.168.18.87 or http://192.168.18.87:8080"
              inputMode="url"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Optional for tablets on the HTTPS Vercel site — Print uses a
              Supabase job queue (no mixed-content block). Keep{" "}
              <code className="rounded bg-muted px-1">npm run dev</code> on the
              Windows booth PC so the worker polls and prints. Use this URL only
              when guests open the booth on the LAN HTTP site for direct print.
              Bare IPs get <code className="rounded bg-muted px-1">http://</code>{" "}
              and port <code className="rounded bg-muted px-1">8080</code>{" "}
              automatically.
            </p>
          </div>
          {detectedPrinters.length > 0 ? (
            <div className="rounded-md bg-muted/60 px-3 py-2 text-xs">
              <p className="font-medium text-foreground">
                Detected on this PC
              </p>
              <ul className="mt-1 max-h-36 space-y-1 overflow-y-auto">
                {detectedPrinters.map((p) => (
                  <li key={p.name}>
                    <button
                      type="button"
                      className="text-left underline-offset-2 hover:underline"
                      onClick={() => setPrinterName(p.name)}
                      title="Use this printer name"
                    >
                      {p.name}
                    </button>
                    <span className="text-muted-foreground">
                      {" "}
                      —{" "}
                      {p.ready
                        ? "ready"
                        : p.workOffline
                          ? "Work Offline"
                          : p.status || "not ready"}
                      {p.driverName ? ` · ${p.driverName}` : ""}
                      {/evolis/i.test(p.name)
                        ? " · card printer (CR80)"
                        : ""}
                      {p.softDriver ||
                      /ipp class driver|microsoft ipp|^wsd/i.test(
                        `${p.driverName || ""} ${p.portName || ""}`,
                      )
                        ? " · network/Wi‑Fi (direct IPP when reachable)"
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : printersHint ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {printersHint}
            </p>
          ) : null}
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>
              On the Windows booth PC, keep the app server running (
              <code className="rounded bg-muted px-1">
                npm run dev -- --host --port 8080
              </code>
              ). That starts the print-queue worker. Same Wi‑Fi as the SELPHY.
              Current target printer: <strong>{resolvedPrinter}</strong>.
            </li>
            <li>
              Tablets on Vercel (HTTPS) Print via same-origin{" "}
              <code className="rounded bg-muted px-1">/api/print</code> →
              Supabase queue → booth worker → SELPHY. No Android print dialog.
              Booth print server URL is not required for that path.
            </li>
            <li>
              Optional: set <strong>Booth print server URL</strong> if guests
              use the LAN HTTP booth site and you want an explicit direct target
              (e.g. http://192.168.18.87:8080). HTTPS pages never call an HTTP
              booth URL from the browser (mixed content).
            </li>
            <li>
              USB: install the manufacturer driver (Canon SELPHY or Evolis).
              Wi‑Fi SELPHY: power on, same Wi‑Fi as this booth PC. Set Printer
              IP above if auto-detect picks a stale address.
            </li>
            <li>
              If Wi‑Fi SELPHY still fails: run Canon SELPHY Wi‑Fi setup / SELPHY
              PRINT so a non‑WSD queue appears. Evolis Primacy 2 stays available
              for CR80 card reprints only.
            </li>
            <li>Optional fullscreen booth Chrome shortcut:</li>
          </ol>
          <code className="block break-all rounded-md bg-muted px-3 py-2 text-xs">
            {kioskHint}
          </code>
        </div>

        <div className="space-y-2">
          <Label htmlFor="freepik">Magnific / Freepik API key</Label>
          <Input
            id="freepik"
            type="password"
            value={freepik}
            onChange={(e) => setFreepik(e.target.value)}
            placeholder={
              settings?.freepik_api_key_set
                ? "Leave masked value, or paste a new key"
                : "Paste Magnific API key (starts with MS…)"
            }
          />
          <p className="text-xs text-muted-foreground">
            {settings?.freepik_api_key_set
              ? "Key is configured. Paste a new key only if you want to replace it."
              : "Required for the photo booth AI transform. Copy only the API key, not the webhook secret."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin_username">Admin username</Label>
          <Input
            id="admin_username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin_password">New admin password</Label>
          <Input
            id="admin_password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to keep current password"
            autoComplete="new-password"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-accent">{message}</p> : null}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </form>

      <section className="mt-12 space-y-4 rounded-3xl border border-destructive/40 bg-destructive/5 p-5">
        <div>
          <h2 className="font-display text-xl font-semibold text-destructive">
            Danger zone
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Deletes all registrations and photos. Does not remove stores or
            settings.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="purge_password">Admin password</Label>
          <Input
            id="purge_password"
            type="password"
            value={purgePassword}
            onChange={(e) => setPurgePassword(e.target.value)}
            placeholder="Enter current admin password to enable"
            autoComplete="current-password"
          />
        </div>
        <Button
          type="button"
          variant="destructive"
          disabled={!purgePassword.trim()}
          onClick={() => setPurgeConfirmOpen(true)}
        >
          Remove all data
        </Button>
      </section>

      <AlertDialog
        open={purgeConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !purging) setPurgeConfirmOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove all event data?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every guest registration and Future ID
              photo (including receipt and photo files in storage). Stores, mall
              logo, printer settings, and admin login are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={purging}
              onClick={(e) => {
                e.preventDefault();
                void (async () => {
                  setPurging(true);
                  setError(null);
                  try {
                    const res = await fetch("/api/admin/purge", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ password: purgePassword }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      const msg = data.error || "Could not remove data";
                      setError(msg);
                      toast.error(msg);
                      return;
                    }
                    setPurgePassword("");
                    setPurgeConfirmOpen(false);
                    toast.success(
                      data.message ||
                        "Deleted all registrations and photos. Stores and settings were kept.",
                    );
                    setMessage(
                      `Removed ${data.guests_deleted ?? 0} registrations and ${data.photos_deleted ?? 0} photos.`,
                    );
                  } catch {
                    setError("Could not remove data");
                    toast.error("Could not remove data");
                  } finally {
                    setPurging(false);
                  }
                })();
              }}
            >
              {purging ? "Removing…" : "Yes, remove all data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

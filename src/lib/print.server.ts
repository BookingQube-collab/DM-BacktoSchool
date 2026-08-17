import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSetting, resolveDohaMallLogoUrl } from "@/lib/settings.server";

const DEFAULT_PRINTER_NAME = "Canon SELPHY CP1500";
/** Canon Inc. Wi‑Fi OUI used by SELPHY CP1500 (ARP/NetNeighbor). */
const CANON_SELPHY_MAC_PREFIX = "DC-C2-C9";

export type InstalledPrinter = {
  name: string;
  status: string;
  workOffline: boolean;
  ready: boolean;
  driverName?: string;
  portName?: string;
  /**
   * Microsoft IPP / WSD / virtual class drivers (common for Wi‑Fi SELPHY).
   * Prefer Canon USB when both exist; network queues are still printable.
   */
  softDriver?: boolean;
  /** Direct IPP URL when discovered (Wi‑Fi SELPHY), e.g. http://192.168.x.x:631/ipp/print */
  ippUrl?: string;
};

type IppEndpoint = {
  url: string;
  ip?: string;
  printerUri: string;
};

type IppCacheEntry = { endpoint: IppEndpoint | null; at: number };
const ippEndpointCache = new Map<string, IppCacheEntry>();
/** Short TTL — DHCP / SELPHY Wi‑Fi can change LAN IP (e.g. .103 → .108). */
const IPP_CACHE_TTL_MS = 60_000;

const BOOTH_NETWORK_ERROR =
  "Open this app from the booth computer network.";

export async function resolvePrinterName(override?: string) {
  const fromBody = override?.trim();
  if (fromBody) return fromBody;
  const fromSettings = (await getSetting("printer_name")).trim();
  return fromSettings || DEFAULT_PRINTER_NAME;
}

/** Optional Admin override for Wi‑Fi SELPHY LAN IP / hostname. */
export async function resolvePrinterHost(override?: string): Promise<string> {
  const fromBody = override?.trim();
  if (fromBody) return normalizePrinterHost(fromBody);
  const fromSettings = (await getSetting("printer_host")).trim();
  return normalizePrinterHost(fromSettings);
}

function normalizePrinterHost(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  // Allow "192.168.18.108", "http://192.168.18.108:631/ipp/print", or hostname.
  try {
    if (/^https?:\/\//i.test(t) || /^ipps?:\/\//i.test(t)) {
      const u = new URL(t.replace(/^ipps?:/i, (m) => (m.startsWith("ipps") ? "https:" : "http:")));
      return u.hostname;
    }
  } catch {
    /* fall through */
  }
  return t.replace(/^\[|\]$/g, "").split("/")[0]?.split(":")[0]?.trim() || "";
}

function assertPrintableImageBytes(buf: Buffer, label = "Print image") {
  if (buf.length < 2_048) {
    throw new Error(
      `${label} is empty or too small. Wait for the photo to finish loading, then try Print again.`,
    );
  }
  if (buf.length > 20 * 1024 * 1024) {
    throw new Error(`${label} is too large`);
  }
}

function parsePngDataUrl(raw: string): Buffer {
  const match = /^data:image\/png;base64,(.+)$/i.exec(raw.trim());
  if (!match?.[1]) {
    throw new Error("Print image must be a PNG data URL");
  }
  const buf = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  // A real transform photo PNG is tens–hundreds of KB; reject near-empty payloads.
  assertPrintableImageBytes(buf);
  return buf;
}

function imageExtFromBytes(buf: Buffer): "png" | "jpg" | "webp" {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpg";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  // Transform uploads are PNG; treat unknown as png for System.Drawing.
  return "png";
}

/** Load printable image bytes from a public/signed URL (admin reprint, etc.). */
export async function fetchPrintableImageBytes(url: string): Promise<Buffer> {
  const trimmed = url?.trim();
  if (!trimmed) {
    throw new Error("Image URL is required");
  }
  const res = await fetch(trimmed);
  if (!res.ok) {
    throw new Error(`Could not download print image (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  assertPrintableImageBytes(buf, "Downloaded print image");
  return buf;
}

/** Best-effort load of Admin → Settings Doha Mall logo (never throws). */
async function loadDohaMallLogoBytes(): Promise<Buffer | null> {
  try {
    const { path, url } = await resolveDohaMallLogoUrl();
    if (path) {
      const { data, error } = await supabaseAdmin.storage
        .from("branding")
        .download(path);
      if (!error && data) {
        const buf = Buffer.from(await data.arrayBuffer());
        if (buf.length >= 64) return buf;
      }
    }
    if (url?.trim()) {
      const res = await fetch(url.trim());
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length >= 64) return buf;
      }
    }
  } catch {
    /* logo optional — print without it */
  }
  return null;
}

/**
 * Composite Admin Doha Mall logo onto the right side of the postcard raster
 * (bottom-right badge; System.Drawing via PowerShell — same stack as silent SELPHY).
 * Returns original bytes if logo is missing or composite fails.
 */
async function compositeMallLogoOntoPostcard(
  posterBytes: Buffer,
  logoBytes: Buffer,
): Promise<Buffer> {
  if (process.platform !== "win32") return posterBytes;

  const posterExt = imageExtFromBytes(posterBytes);
  const logoExt = imageExtFromBytes(logoBytes);
  const dir = await mkdtemp(join(tmpdir(), "future-id-logo-"));
  const posterPath = join(dir, `poster.${posterExt}`);
  const logoPath = join(dir, `logo.${logoExt}`);
  // Always emit PNG so logo alpha stays crisp before IPP JPEG convert.
  const outPath = join(dir, "out.png");

  await writeFile(posterPath, posterBytes);
  await writeFile(logoPath, logoBytes);

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$posterPath = ${JSON.stringify(posterPath)}
$logoPath = ${JSON.stringify(logoPath)}
$outPath = ${JSON.stringify(outPath)}

$poster = [System.Drawing.Image]::FromFile($posterPath)
$logo = [System.Drawing.Image]::FromFile($logoPath)
$bmp = $null
$g = $null
try {
  if ($poster.Width -lt 80 -or $poster.Height -lt 80) {
    throw 'Poster too small for logo composite'
  }
  if ($logo.Width -lt 4 -or $logo.Height -lt 4) {
    throw 'Logo too small'
  }

  $bmp = New-Object System.Drawing.Bitmap ([int]$poster.Width), ([int]$poster.Height), ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bmp.SetResolution($poster.HorizontalResolution, $poster.VerticalResolution)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($poster, 0, 0, $poster.Width, $poster.Height)

  # ~12% of postcard width; keep aspect; bottom-right with margin (on-photo badge)
  $targetW = [int][Math]::Max(48, [Math]::Round($poster.Width * 0.12))
  $scale = $targetW / [double]$logo.Width
  $targetH = [int][Math]::Max(24, [Math]::Round($logo.Height * $scale))
  # Cap height so tall logos don't cover the photo
  $maxH = [int][Math]::Round($poster.Height * 0.12)
  if ($targetH -gt $maxH) {
    $targetH = $maxH
    $targetW = [int][Math]::Max(48, [Math]::Round($logo.Width * ($targetH / [double]$logo.Height)))
  }

  $margin = [int][Math]::Max(12, [Math]::Round($poster.Width * 0.028))
  $x = $poster.Width - $targetW - $margin
  if ($x -lt $margin) { $x = $margin }
  $y = $poster.Height - $targetH - $margin
  if ($y -lt $margin) { $y = $margin }

  # No opaque pad — draw logo with its own alpha so transparent PNG stays clear.
  $g.DrawImage($logo, $x, $y, $targetW, $targetH)

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output 'ok'
} finally {
  if ($g) { $g.Dispose() }
  if ($bmp) { $bmp.Dispose() }
  $logo.Dispose()
  $poster.Dispose()
}
`;

  try {
    await runPowerShell(script, 15_000);
    const out = await readFile(outPath);
    if (out.length < 2_048) return posterBytes;
    return out;
  } finally {
    for (const p of [posterPath, logoPath, outPath]) {
      try {
        await unlink(p);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Merge Admin Doha Mall logo onto the right of printable bytes when available.
 * Never fails the print job — returns original image on any error / missing logo.
 */
export async function withDohaMallLogoForPrint(bytes: Buffer): Promise<Buffer> {
  try {
    const logo = await loadDohaMallLogoBytes();
    if (!logo) return bytes;
    return await compositeMallLogoOntoPostcard(bytes, logo);
  } catch {
    return bytes;
  }
}

/**
 * Silently spool raw image bytes (PNG/JPEG/WebP) to the booth printer.
 * Shared by booth `/api/print` (via data URL) and admin reprint.
 */
export async function printPostcardImageBytes(
  bytes: Buffer,
  printerName: string,
) {
  assertPrintableImageBytes(bytes);
  const withLogo = await withDohaMallLogoForPrint(bytes);
  const ext = imageExtFromBytes(withLogo);
  return printPostcardFileBytes(withLogo, ext, printerName);
}

function extractPsError(e: unknown): string {
  const err = e as {
    message?: string;
    stderr?: string | Buffer;
    stdout?: string | Buffer;
    killed?: boolean;
    code?: string | number | null;
    timedOut?: boolean;
  };
  if (err.killed || err.timedOut || err.code === "ETIMEDOUT") {
    return "Printer not ready (timed out waiting for Windows spooler).";
  }
  const stderr = err.stderr
    ? Buffer.isBuffer(err.stderr)
      ? err.stderr.toString("utf8")
      : String(err.stderr)
    : "";
  const stdout = err.stdout
    ? Buffer.isBuffer(err.stdout)
      ? err.stdout.toString("utf8")
      : String(err.stdout)
    : "";
  const raw = (stderr || stdout || err.message || "Print failed").trim();
  const useful =
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(
        (line) =>
          line &&
          !line.startsWith("At ") &&
          !line.startsWith("+") &&
          !line.startsWith("---") &&
          !/^CategoryInfo|FullyQualifiedErrorId/i.test(line),
      ) || raw;
  // Never ship mega printer inventories through error strings.
  const cut = useful.split(/\s+Available:/i)[0]?.trim() || useful;
  return cut.slice(0, 280);
}

function killProcessTree(pid: number | undefined) {
  if (!pid || process.platform !== "win32") return;
  try {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
      detached: true,
    }).unref();
  } catch {
    /* ignore */
  }
}

async function runPowerShell(script: string, timeoutMs = 45_000) {
  // Prefer -File over -Command so nested quotes / here-strings stay intact.
  // BOM helps Windows PowerShell 5 parse UTF-8 (smart quotes / dashes in scripts).
  const dir = await mkdtemp(join(tmpdir(), "future-id-ps-"));
  const ps1 = join(dir, "run.ps1");
  await writeFile(ps1, `\uFEFF${script}`, "utf8");

  try {
    return await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            ps1,
          ],
          {
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );

        let stdout = "";
        let stderr = "";
        let settled = false;
        const maxBuf = 4 * 1024 * 1024;

        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn();
        };

        const timer = setTimeout(() => {
          killProcessTree(child.pid);
          try {
            child.kill();
          } catch {
            /* ignore */
          }
          finish(() =>
            reject(
              Object.assign(
                new Error(
                  "Printer not ready (timed out waiting for Windows spooler).",
                ),
                {
                  timedOut: true,
                  killed: true,
                  stdout,
                  stderr,
                },
              ),
            ),
          );
        }, timeoutMs);

        child.stdout?.on("data", (chunk: Buffer | string) => {
          stdout += chunk.toString();
          if (stdout.length > maxBuf) stdout = stdout.slice(-maxBuf);
        });
        child.stderr?.on("data", (chunk: Buffer | string) => {
          stderr += chunk.toString();
          if (stderr.length > maxBuf) stderr = stderr.slice(-maxBuf);
        });

        child.on("error", (err) => {
          finish(() => reject(err));
        });

        child.on("close", (code) => {
          finish(() => {
            if (code === 0) {
              resolve({ stdout, stderr });
              return;
            }
            reject(
              Object.assign(new Error(stderr || stdout || `PowerShell exited ${code}`), {
                code,
                stdout,
                stderr,
              }),
            );
          });
        });
      },
    ).catch((e) => {
      throw new Error(extractPsError(e));
    });
  } finally {
    try {
      await unlink(ps1);
    } catch {
      /* ignore */
    }
  }
}

function normalizeStatus(raw: unknown): string {
  if (raw == null) return "Unknown";
  if (typeof raw === "number") {
    // Get-Printer PrinterStatus enum (bit flags common values)
    if (raw === 0) return "Normal";
    const parts: string[] = [];
    if (raw & 1) parts.push("Paused");
    if (raw & 2) parts.push("Error");
    if (raw & 4) parts.push("PendingDeletion");
    if (raw & 8) parts.push("PaperJam");
    if (raw & 16) parts.push("PaperOut");
    if (raw & 32) parts.push("ManualFeed");
    if (raw & 64) parts.push("PaperProblem");
    if (raw & 128) parts.push("Offline");
    if (raw & 512) parts.push("Busy");
    if (raw & 1024) parts.push("Printing");
    return parts.length ? parts.join(", ") : `Status(${raw})`;
  }
  return String(raw);
}

function isReadyStatus(status: string, workOffline: boolean): boolean {
  if (workOffline) return false;
  const s = status.toLowerCase();
  if (!s || s === "unknown" || s === "normal" || s === "idle" || s === "printing" || s === "busy") {
    return !/\b(offline|error|paused|pendingdeletion|paperout|paperjam)\b/.test(s);
  }
  return !/\b(offline|error|paused|pendingdeletion|paperout|paperjam)\b/.test(s);
}

/**
 * Soft/network class drivers (Wi‑Fi SELPHY often lands here via Microsoft IPP/WSD).
 * Used for preference + shorter timeouts — not a hard refuse.
 */
export function isSoftPrintDriver(
  driverName?: string | null,
  portName?: string | null,
): boolean {
  const d = (driverName || "").toLowerCase();
  const p = (portName || "").toLowerCase();
  if (/microsoft ipp|ipp class driver|universal print class|virtual print class/i.test(d)) {
    return true;
  }
  // WSD / IPP ports are typical for network SELPHY
  if (p.startsWith("wsd") || p.includes("ipp")) return true;
  return false;
}

function connectionHint(match?: Pick<InstalledPrinter, "softDriver" | "portName" | "driverName">) {
  if (match?.softDriver || isSoftPrintDriver(match?.driverName, match?.portName)) {
    return "check SELPHY power, same Wi‑Fi as this PC, and paper/ink";
  }
  return "check USB power, cassette, and the Canon SELPHY driver";
}

function isSelphyName(name?: string | null): boolean {
  return /selphy|cp1500/i.test(name || "");
}

/** Ready alternate queue (native first). Used only when name resolution fails. */
function suggestReadyAlternate(
  printers: InstalledPrinter[],
  excludeName: string,
): string | null {
  const exclude = excludeName.trim().toLowerCase();
  const readyNative = printers.filter(
    (p) =>
      p.ready &&
      !p.softDriver &&
      p.name.trim().toLowerCase() !== exclude,
  );
  // Prefer another SELPHY/Canon native queue before card printers.
  const selphyNative = readyNative.find((p) => isSelphyName(p.name));
  if (selphyNative) return selphyNative.name;
  if (readyNative[0]) return readyNative[0].name;
  const anyReady = printers.find(
    (p) => p.ready && p.name.trim().toLowerCase() !== exclude,
  );
  return anyReady?.name ?? null;
}

function selphyWifiStaffHint(): string {
  return "check SELPHY power and Wi‑Fi (same network as the booth PC), or set Printer IP in Admin → Settings";
}

/**
 * Staff-facing print errors: short, no mega “Available:” inventory.
 * SELPHY Wi‑Fi failures stay SELPHY-specific (not Evolis-first).
 */
function formatStaffPrintError(
  message: string,
  ctx: {
    resolved: string;
    softDriver?: boolean;
    printers: InstalledPrinter[];
  },
): string {
  const raw = (message || "Print failed").split(/\s+Available:/i)[0]?.trim() || "Print failed";
  const soft =
    Boolean(ctx.softDriver) ||
    /wi‑?fi|wifi|network\/ipp|ipp|wsd|microsoft ipp|soft.?driver/i.test(raw);
  const selphy = soft || isSelphyName(ctx.resolved);

  if (/booth computer network|requires the app server|win32/i.test(raw)) {
    return BOOTH_NETWORK_ERROR;
  }

  // Slow IPP ACK is not a reject — never map it to “did not accept”.
  if (/accepted-slow-ack|slow.?ack/i.test(raw)) {
    return raw;
  }
  if (
    /ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|connect (E|failed)|could not reach|no reachable|unreachable/i.test(
      raw,
    ) &&
    selphy
  ) {
    return `SELPHY not reachable on Wi‑Fi — ${selphyWifiStaffHint()}.`;
  }
  if (/timed out|not ready|did not accept|0 bytes|rejected|ipp /i.test(raw) && selphy) {
    return `SELPHY Wi‑Fi did not accept the job — ${selphyWifiStaffHint()}.`;
  }
  if (/timed out|not ready/i.test(raw)) {
    const alt = suggestReadyAlternate(ctx.printers, ctx.resolved);
    return alt
      ? `Printer “${ctx.resolved}” timed out — check power/connection, or select “${alt}” in Settings.`
      : `Printer “${ctx.resolved}” timed out — check power and connection.`;
  }
  if (/work offline/i.test(raw)) {
    return `Printer “${ctx.resolved}” is Work Offline — open its Windows queue and turn that off.`;
  }
  if (/\boffline\b/i.test(raw)) {
    return `Printer “${ctx.resolved}” is offline — ${connectionHint({ softDriver: soft })}.`;
  }
  if (/not found|not valid/i.test(raw)) {
    return `Printer “${ctx.resolved}” not found — pick a Detected printer in Admin → Settings.`;
  }

  // Keep one short sentence + matched queue name when useful.
  const base = raw.length > 180 ? `${raw.slice(0, 177)}…` : raw;
  if (/“[^”]+”/.test(base) || base.includes(ctx.resolved)) return base;
  return `${base} (printer: “${ctx.resolved}”)`;
}

/**
 * Compact list for “printer not found” only — never dump full inventory into UI.
 */
function formatMatchedPrinterHint(
  wanted: string,
  printers: InstalledPrinter[],
): string {
  if (!printers.length) {
    return `No printers detected on this Windows PC. Run the booth app on the PC with the printer.`;
  }
  const alt = suggestReadyAlternate(printers, wanted);
  const readyNames = printers
    .filter((p) => p.ready)
    .slice(0, 3)
    .map((p) => `“${p.name}”`);
  const sample =
    readyNames.length > 0
      ? `Ready: ${readyNames.join(", ")}`
      : `Try: “${printers[0]!.name}”`;
  return alt
    ? `Set Admin → Settings → Printer name (e.g. “${alt}”). ${sample}.`
    : `Set Admin → Settings → Printer name to an exact Windows name. ${sample}.`;
}

function isCanonNativeDriver(driverName?: string | null): boolean {
  const d = (driverName || "").toLowerCase();
  return (
    /canon/.test(d) &&
    /selphy|cp1500|cp1\d{2,}/.test(d) &&
    !isSoftPrintDriver(d)
  );
}

/**
 * List printers installed on the Windows host running the Node server.
 */
export async function listInstalledPrinters(): Promise<InstalledPrinter[]> {
  if (process.platform !== "win32") return [];

  const script = `
$ErrorActionPreference = 'Stop'
$items = @()
try {
  $items = @(Get-Printer | ForEach-Object {
    $wo = $false
    try { $wo = [bool]$_.WorkOffline } catch { $wo = $false }
    $driver = ''
    try { $driver = [string]$_.DriverName } catch { $driver = '' }
    $port = ''
    try { $port = [string]$_.PortName } catch { $port = '' }
    [pscustomobject]@{
      name = $_.Name
      status = [string]$_.PrinterStatus
      workOffline = $wo
      driverName = $driver
      portName = $port
    }
  })
} catch {
  $items = @(Get-CimInstance Win32_Printer | ForEach-Object {
    [pscustomobject]@{
      name = $_.Name
      status = [string]$_.PrinterStatus
      workOffline = [bool]$_.WorkOffline
      driverName = [string]$_.DriverName
      portName = [string]$_.PortName
    }
  })
}
$items | ConvertTo-Json -Compress
`;

  const { stdout } = await runPowerShell(script, 20_000);
  const text = stdout.trim();
  if (!text) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  const printers: InstalledPrinter[] = [];
  for (const row of rows) {
    const r = row as {
      name?: unknown;
      Name?: unknown;
      status?: unknown;
      workOffline?: unknown;
      WorkOffline?: unknown;
      driverName?: unknown;
      DriverName?: unknown;
      portName?: unknown;
      PortName?: unknown;
    };
    const name = String(r.name ?? r.Name ?? "").trim();
    if (!name) continue;
    const workOffline = Boolean(r.workOffline ?? r.WorkOffline);
    const status = normalizeStatus(r.status);
    const driverName = String(r.driverName ?? r.DriverName ?? "").trim();
    const portName = String(r.portName ?? r.PortName ?? "").trim();
    const softDriver = isSoftPrintDriver(driverName, portName);
    printers.push({
      name,
      status,
      workOffline,
      // Network/IPP queues can be ready when the Wi‑Fi SELPHY is online.
      ready: isReadyStatus(status, workOffline),
      driverName: driverName || undefined,
      portName: portName || undefined,
      softDriver,
    });
  }
  return printers.sort((a, b) => {
    if (a.ready !== b.ready) return a.ready ? -1 : 1;
    // Prefer native USB when listing, but keep network queues selectable.
    if (Boolean(a.softDriver) !== Boolean(b.softDriver)) {
      return a.softDriver ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Score how well an installed printer matches the requested name. Higher is better. */
function matchScore(requested: string, candidate: InstalledPrinter): number {
  const req = requested.trim().toLowerCase();
  const name = candidate.name.trim().toLowerCase();
  if (!req || !name) return 0;

  let score = 0;
  if (name === req) score = 1000;
  else if (req.length >= 4 && name.includes(req)) score = 700;
  else if (name.length >= 6 && req.includes(name)) score = 650;
  else {
    const reqTokens = tokenize(requested).filter((t) => t.length >= 3);
    const nameTokens = tokenize(candidate.name).filter((t) => t.length >= 3);
    if (!reqTokens.length || !nameTokens.length) return 0;

    const hits = reqTokens.filter((t) =>
      nameTokens.some(
        (n) =>
          n === t ||
          (t.length >= 4 && n.length >= 4 && (n.includes(t) || t.includes(n))),
      ),
    );
    const ratio = hits.length / reqTokens.length;
    // Require a real substantive hit (model/brand), not noise like "2"
    const strong = hits.some(
      (t) =>
        t === "selphy" ||
        t.startsWith("cp15") ||
        t.startsWith("canon") ||
        t.length >= 5,
    );
    if (ratio < 0.5 || !strong) return 0;

    score = Math.round(250 + ratio * 400);
    if (name.includes("selphy") && (req.includes("selphy") || req.includes("cp1500"))) {
      score = Math.max(score, 850);
    }
    if (name.includes("cp1500") && req.includes("cp1500")) {
      score = Math.max(score, 900);
    }
  }

  // Prefer manufacturer USB when both exist; still allow Wi‑Fi/IPP SELPHY queues.
  if (isCanonNativeDriver(candidate.driverName)) score += 200;
  else if (candidate.softDriver) score -= 80;

  if (candidate.ready) score += 50;
  else if (candidate.workOffline) score -= 20;
  else if (/\boffline\b/i.test(candidate.status)) score -= 30;

  return score;
}

/**
 * Resolve configured/requested printer name to an installed Windows printer.
 * Case-insensitive; allows partial matches (e.g. "SELPHY" / "CP1500").
 * Prefers Canon native USB when both exist; Wi‑Fi/IPP SELPHY queues are allowed.
 */
export async function resolveInstalledPrinter(requested: string): Promise<{
  requested: string;
  resolved: string;
  printers: InstalledPrinter[];
  match: InstalledPrinter;
}> {
  const wanted = requested.trim() || DEFAULT_PRINTER_NAME;
  const printers = await listInstalledPrinters();

  if (!printers.length) {
    throw new Error(
      `Printer not found: “${wanted}”. No printers detected on this Windows PC. Run the booth app on the PC with the SELPHY (or your card printer) and select that queue in Admin.`,
    );
  }

  const ranked = printers
    .map((p) => ({ p, score: matchScore(wanted, p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.p.ready) - Number(a.p.ready));

  const best = ranked[0];
  if (!best || best.score < 200) {
    throw new Error(
      `Printer not found: “${wanted}”. ${formatMatchedPrinterHint(wanted, printers)}`,
    );
  }

  // Prefer native ready printers among close scores; otherwise use the best
  // match even if it is a Wi‑Fi/IPP queue (common for network SELPHY).
  const topScore = best.score;
  const close = ranked.filter((x) => x.score >= topScore - 80);
  const preferred =
    close.find((x) => !x.p.softDriver && x.p.ready)?.p ??
    close.find((x) => !x.p.softDriver)?.p ??
    close.find((x) => x.p.ready)?.p ??
    close.find((x) => !x.p.workOffline && !/\boffline\b/i.test(x.p.status))?.p ??
    best.p;

  return {
    requested: wanted,
    resolved: preferred.name,
    printers,
    match: preferred,
  };
}

async function tryClearWorkOffline(printerName: string): Promise<boolean> {
  const script = `
$ErrorActionPreference = 'Stop'
$name = ${JSON.stringify(printerName)}
$cleared = $false
try {
  $p = Get-Printer -Name $name -ErrorAction Stop
  if ($p.PSObject.Properties.Name -contains 'WorkOffline' -and $p.WorkOffline) {
    Set-Printer -Name $name -WorkOffline $false
    $cleared = $true
  }
} catch {}
try {
  $w = Get-CimInstance Win32_Printer -Filter ("Name='" + ($name -replace "'","''") + "'")
  if ($w -and $w.WorkOffline) {
    $w.WorkOffline = $false
    Set-CimInstance -InputObject $w
    $cleared = $true
  }
} catch {}
if ($cleared) { 'cleared' } else { 'noop' }
`;
  try {
    const { stdout } = await runPowerShell(script, 12_000);
    return stdout.trim().toLowerCase().includes("cleared");
  } catch {
    return false;
  }
}

/**
 * Silently spool a PNG to a Windows printer via System.Drawing (no dialog).
 * Requires the Node server to run on the booth PC with the SELPHY (USB or Wi‑Fi).
 *
 * - Uses StandardPrintController (no “Printing…” status dialog).
 * - Runs Print() on a background thread so WSD/IPP hangs fail fast.
 * - Never invents a custom PaperSize the driver does not advertise.
 * - Verifies spool job size; refuses false success on 0-byte / error jobs.
 * - Network/IPP queues use a shorter wait to avoid long hangs.
 */
async function printPngWindows(
  filePath: string,
  printerName: string,
  opts?: { softDriver?: boolean },
) {
  const soft = Boolean(opts?.softDriver);
  // Soft/network queues stall on “Waiting for printer connection…” — fail in a few seconds.
  // Critical: Print() itself blocks on WSD; we must timeout the call, not only EndPrint.
  const printWaitMs = soft ? 5_000 : 12_000;
  const spoolPollLoops = soft ? 6 : 16;
  const psTimeoutMs = soft ? 10_000 : 35_000;
  const notReadyHint = soft
    ? selphyWifiStaffHint()
    : "check USB, power, and cassette";
  const rejectHint = soft
    ? selphyWifiStaffHint()
    : "Install the Canon SELPHY USB manufacturer driver (or select a ready queue in Admin) and retry.";

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$path = ${JSON.stringify(filePath)}
$printer = ${JSON.stringify(printerName)}
$docName = 'Future ID Postcard'
$submittedAfter = [DateTime]::UtcNow.AddSeconds(-2)
$printWaitMs = ${printWaitMs}
$spoolPollLoops = ${spoolPollLoops}
$notReadyHint = ${JSON.stringify(notReadyHint)}
$rejectHint = ${JSON.stringify(rejectHint)}

# Drop stale zero-byte jobs so we do not false-succeed on leftovers.
try {
  Get-PrintJob -PrinterName $printer -ErrorAction SilentlyContinue |
    Where-Object { $_.DocumentName -eq $docName -and ([int]$_.Size -eq 0) } |
    ForEach-Object {
      try { Remove-PrintJob -PrinterName $printer -ID $_.Id -ErrorAction SilentlyContinue } catch {}
    }
} catch {}

$img = [System.Drawing.Image]::FromFile($path)
try {
  if ($img.Width -lt 80 -or $img.Height -lt 80) {
    throw ('Print image dimensions are too small ({0}x{1}). Photo not ready.' -f $img.Width, $img.Height)
  }

  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.DocumentName = $docName
  $doc.PrinterSettings.PrinterName = $printer
  if (-not $doc.PrinterSettings.IsValid) {
    throw ('Printer name is not valid for System.Drawing: {0}' -f $printer)
  }

  # Critical: hide Windows Printing status / Cancel dialog.
  $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins 0,0,0,0

  # Prefer real photo/card sizes when the driver lists them; otherwise keep default.
  # Never invent a custom PaperSize (IPP Class Driver rejects fake 6x4 with 0-byte jobs).
  $chosen = $null
  $priority = @(
    'Postcard', '4.?x.?6', '6.?x.?4', 'P Size', 'KG', 'Photo',
    'CR80', 'Card', 'ISO.?7810'
  )
  foreach ($pat in $priority) {
    foreach ($ps in $doc.PrinterSettings.PaperSizes) {
      if ($ps.PaperName -match $pat) {
        $chosen = $ps
        break
      }
    }
    if ($chosen) { break }
  }
  if ($chosen) {
    $doc.DefaultPageSettings.PaperSize = $chosen
  }

  $pw = [int]$doc.DefaultPageSettings.PaperSize.Width
  $ph = [int]$doc.DefaultPageSettings.PaperSize.Height
  if ($pw -lt 50 -or $ph -lt 50) {
    throw ('Printer reported an invalid paper size ({0} x {1} hundredths of an inch).' -f $pw, $ph)
  }

  # Orient so the printable area matches the card (landscape postcard / CR80).
  $imgLandscape = $img.Width -ge $img.Height
  $paperLandscape = $pw -ge $ph
  $doc.DefaultPageSettings.Landscape = ($imgLandscape -xor $paperLandscape)

  $state = @{
    drew = $false
    destW = 0
    destH = 0
    paper = [string]$doc.DefaultPageSettings.PaperSize.PaperName
    landscape = [bool]$doc.DefaultPageSettings.Landscape
    err = ''
    printEx = ''
  }

  $doc.add_PrintPage({
    param($sender, $e)
    try {
      $dest = $e.MarginBounds
      if ($dest.Width -lt 10 -or $dest.Height -lt 10) {
        $dest = $e.PageBounds
      }
      if ($dest.Width -lt 10 -or $dest.Height -lt 10) {
        $state.err = ('Printable page bounds are empty (paper={0}). Check driver paper sizes and retry.' -f $state.paper)
        $e.Cancel = $true
        return
      }
      $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Display
      $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $e.Graphics.Clear([System.Drawing.Color]::White)

      # Cover-fit (crop center) so the photo fills the postcard with no white side bars.
      $scale = [Math]::Max([double]$dest.Width / $img.Width, [double]$dest.Height / $img.Height)
      $w = [int][Math]::Max(1, [Math]::Ceiling($img.Width * $scale))
      $h = [int][Math]::Max(1, [Math]::Ceiling($img.Height * $scale))
      $x = $dest.X + [int](($dest.Width - $w) / 2)
      $y = $dest.Y + [int](($dest.Height - $h) / 2)
      $e.Graphics.SetClip($dest)
      $e.Graphics.DrawImage($img, $x, $y, $w, $h)
      $e.Graphics.ResetClip()
      $e.HasMorePages = $false
      $state.drew = $true
      $state.destW = $dest.Width
      $state.destH = $dest.Height
    } catch {
      $state.err = $_.Exception.Message
      $e.Cancel = $true
    }
  })

  # WSD/IPP: Print() can block forever on "Waiting for printer connection".
  # Run it on a worker thread and enforce a hard wait (soft queues: a few seconds).
  $printDone = New-Object System.Threading.ManualResetEventSlim $false
  $worker = [System.Threading.Thread]::new([System.Threading.ThreadStart]{
    try {
      $doc.Print()
    } catch {
      $state.printEx = $_.Exception.Message
    } finally {
      try { $printDone.Set() } catch {}
    }
  })
  $worker.IsBackground = $true
  try { $worker.SetApartmentState([System.Threading.ApartmentState]::STA) } catch {}
  $worker.Start()
  if (-not $printDone.Wait($printWaitMs)) {
    try { $doc.Dispose() } catch {}
    throw ('Printer not ready - print timed out for {0}. {1}.' -f $printer, $notReadyHint)
  }
  try { $doc.Dispose() } catch {}

  if ($state.printEx) { throw [string]$state.printEx }
  if ($state.err) { throw [string]$state.err }
  if (-not $state.drew) {
    throw ('PrintPage never ran for {0} (paper={1}). {2}' -f $printer, $state.paper, $rejectHint)
  }

  # Poll spooler until job has non-zero size, succeeds, or errors. Do NOT treat
  # a missing job as success unless we previously saw Size > 0.
  $jobSize = -1
  $jobStatus = ''
  $pagesPrinted = -1
  $sawNonZero = $false
  $jobGoneAfterNonZero = $false
  try {
    for ($i = 0; $i -lt $spoolPollLoops; $i++) {
      Start-Sleep -Milliseconds 350
      $job = Get-PrintJob -PrinterName $printer -ErrorAction SilentlyContinue |
        Where-Object {
          $_.DocumentName -eq $docName -and
          ($_.SubmittedTime -eq $null -or $_.SubmittedTime.ToUniversalTime() -ge $submittedAfter)
        } |
        Sort-Object SubmittedTime -Descending |
        Select-Object -First 1

      if (-not $job) {
        if ($sawNonZero) {
          $jobGoneAfterNonZero = $true
          break
        }
        # Job never appeared with bytes - keep looking briefly, then fail.
        continue
      }

      $jobSize = [int]$job.Size
      $jobStatus = [string]$job.JobStatus
      try { $pagesPrinted = [int]$job.PagesPrinted } catch { $pagesPrinted = -1 }

      if ($jobSize -gt 0) { $sawNonZero = $true }

      if ($jobStatus -match 'Error|Deleted|PaperOut|Offline|UserIntervention') {
        break
      }
      if ($sawNonZero -and $jobStatus -match 'Printed|Complete') {
        break
      }
      if ($sawNonZero -and $jobStatus -notmatch 'Printing|Spooling|Retained|Paused') {
        break
      }
    }
  } catch {
    # Get-PrintJob may be unavailable on some hosts.
  }

  if ($jobStatus -match 'Error|Deleted|PaperOut|Offline|UserIntervention') {
    throw ('Print job failed (status={0} size={1}). {2}.' -f $jobStatus, $jobSize, $notReadyHint)
  }
  if (-not $sawNonZero -and -not $jobGoneAfterNonZero) {
    throw ('Print job was not accepted (size={0} status={1}). {2}' -f $jobSize, $jobStatus, $rejectHint)
  }
  if ($jobSize -eq 0) {
    throw ('Print job spooled with 0 bytes (status={0}). {1}' -f $jobStatus, $rejectHint)
  }

  Write-Output ('ok paper={0} landscape={1} dest={2}x{3} img={4}x{5} jobSize={6} pagesPrinted={7} status={8}' -f $state.paper, $state.landscape, $state.destW, $state.destH, $img.Width, $img.Height, $jobSize, $pagesPrinted, $jobStatus)
} finally {
  $img.Dispose()
}
`;

  const { stdout } = await runPowerShell(script, psTimeoutMs);
  return stdout.trim();
}

/**
 * Best-effort PNG→JPEG for soft/WSD queues (PowerShell System.Drawing).
 * Falls back to original PNG if conversion fails.
 */
async function pngBufferToJpeg(png: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "future-id-jpg-"));
  const inPath = join(dir, "in.png");
  const outPath = join(dir, "out.jpg");
  await writeFile(inPath, png);
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile(${JSON.stringify(inPath)})
try {
  $img.Save(${JSON.stringify(outPath)}, [System.Drawing.Imaging.ImageFormat]::Jpeg)
} finally {
  $img.Dispose()
}
`;
  try {
    await runPowerShell(script, 8_000);
    const jpeg = await readFile(outPath);
    if (jpeg.length < 1_024) throw new Error("JPEG too small");
    return jpeg;
  } finally {
    try {
      await unlink(inPath);
    } catch {
      /* ignore */
    }
    try {
      await unlink(outPath);
    } catch {
      /* ignore */
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Direct IPP (Wi‑Fi SELPHY) — bypass Microsoft IPP/WSD spooler hang          */
/* -------------------------------------------------------------------------- */

function ippStringAttr(tag: number, name: string, value: string): Buffer {
  const n = Buffer.from(name, "ascii");
  const v = Buffer.from(value, "ascii");
  const b = Buffer.alloc(1 + 2 + n.length + 2 + v.length);
  let o = 0;
  b[o++] = tag;
  b.writeUInt16BE(n.length, o);
  o += 2;
  n.copy(b, o);
  o += n.length;
  b.writeUInt16BE(v.length, o);
  o += 2;
  v.copy(b, o);
  return b;
}

function buildIppPrintJob(
  jpeg: Buffer,
  printerUri: string,
  jobName: string,
): Buffer {
  // Keep job attrs minimal — SELPHY rejects some enum tags; media + scaling is enough.
  const parts: Buffer[] = [
    // IPP 2.0, Print-Job (0x0002), request-id 1
    Buffer.from([0x02, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x01]),
    Buffer.from([0x01]), // operation-attributes-tag
    ippStringAttr(0x47, "attributes-charset", "utf-8"),
    ippStringAttr(0x48, "attributes-natural-language", "en"),
    ippStringAttr(0x45, "printer-uri", printerUri),
    ippStringAttr(0x42, "requesting-user-name", "future-id"),
    ippStringAttr(0x42, "job-name", jobName),
    ippStringAttr(0x49, "document-format", "image/jpeg"),
    Buffer.from([0x02]), // job-attributes-tag
    // SELPHY CP1500 postcard cassette (KP/RP / hagaki)
    ippStringAttr(0x44, "media", "jpn_hagaki_100x148mm"),
    ippStringAttr(0x44, "print-scaling", "fill"),
    ippStringAttr(0x44, "sides", "one-sided"),
    Buffer.from([0x03]), // end-of-attributes
    jpeg,
  ];
  return Buffer.concat(parts);
}

function parseIppStatus(buf: Buffer): { status: number; ok: boolean; detail: string } {
  if (buf.length < 8) {
    return { status: -1, ok: false, detail: "empty IPP response" };
  }
  const status = (buf[2]! << 8) | buf[3]!;
  // successful-ok 0x0000 … successful-ok-events-complete 0x0007
  const ok = status >= 0x0000 && status <= 0x0007;
  const ascii = buf.toString("latin1");
  const reason =
    /job-state-reasons[\x00-\xff]{0,8}([a-z0-9-]+)/i.exec(ascii)?.[1] ||
    /status-message[\x00-\xff]{0,8}([ -~]{3,80})/i.exec(ascii)?.[1] ||
    "";
  return {
    status,
    ok,
    detail: reason || `ipp-status=0x${status.toString(16).padStart(4, "0")}`,
  };
}

function postIpp(
  endpointUrl: string,
  body: Buffer,
  timeoutMs: number,
): Promise<{ buf: Buffer; bodyFinished: boolean }> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(endpointUrl);
    } catch {
      reject(new Error(`Invalid IPP URL: ${endpointUrl}`));
      return;
    }
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;
    let bodyFinished = false;
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 631),
        path: parsed.pathname || "/ipp/print",
        method: "POST",
        headers: {
          "Content-Type": "application/ipp",
          "Content-Length": body.length,
        },
        timeout: timeoutMs,
        ...(isHttps ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if ((res.statusCode || 0) >= 400) {
            reject(
              new Error(
                `IPP HTTP ${res.statusCode} (${buf.length} bytes)`,
              ),
            );
            return;
          }
          resolve({ buf, bodyFinished: true });
        });
      },
    );
    req.on("finish", () => {
      bodyFinished = true;
    });
    req.on("timeout", () => {
      req.destroy();
      reject(
        Object.assign(new Error("IPP print timed out"), {
          bodyFinished,
          timedOut: true,
        }),
      );
    });
    req.on("error", (err) =>
      reject(Object.assign(err, { bodyFinished })),
    );
    req.write(body);
    req.end();
  });
}

function pickBestIppUrl(candidates: string[], ip?: string): string | null {
  const uniq = [...new Set(candidates.map((u) => u.trim()).filter(Boolean))];
  const http631 = uniq.find((u) => /^http:\/\/.+:631\/ipp\/print$/i.test(u));
  if (http631) return http631;
  const anyHttp = uniq.find((u) => /^http:\/\/.+\/ipp\/print$/i.test(u));
  if (anyHttp) return anyHttp;
  const https443 = uniq.find((u) => /^https:\/\/.+:443\/ipp\/print$/i.test(u));
  if (https443) return https443;
  const anyHttps = uniq.find((u) => /^https:\/\/.+\/ipp\/print$/i.test(u));
  if (anyHttps) return anyHttps;
  if (ip && isLikelyLanIpv4(ip)) {
    return `http://${ip}:631/ipp/print`;
  }
  return null;
}

function isLikelyLanIpv4(ip: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return false;
  const parts = ip.split(".").map(Number);
  if (parts.some((n) => Number.isNaN(n) || n > 255)) return false;
  // Reject obvious garbage from UUID nibble matches (e.g. 1.0.5.0).
  if (parts[0] === 0 || parts[0] === 127) return false;
  if (parts[0] === 1 && parts[1] === 0) return false;
  return true;
}

function endpointFromHost(host: string): IppEndpoint | null {
  const h = normalizePrinterHost(host);
  if (!h) return null;
  const url = isLikelyLanIpv4(h)
    ? `http://${h}:631/ipp/print`
    : `http://${h}:631/ipp/print`;
  return {
    url,
    ip: isLikelyLanIpv4(h) ? h : undefined,
    printerUri: url.replace(/^https:/i, "ipp:").replace(/^http:/i, "ipp:"),
  };
}

function probeTcpPort(
  host: string,
  port: number,
  timeoutMs = 900,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function firstReachableIppHost(
  hosts: string[],
): Promise<string | null> {
  const uniq = [
    ...new Set(
      hosts
        .map((h) => normalizePrinterHost(h))
        .filter((h) => h && (isLikelyLanIpv4(h) || /^[a-z0-9._-]+$/i.test(h))),
    ),
  ];
  if (!uniq.length) return null;

  const results = await Promise.all(
    uniq.map(async (host) => {
      // SELPHY AirPrint/IPP is almost always :631; also try :443 briefly.
      const open631 = await probeTcpPort(host, 631, 900);
      if (open631) return host;
      const open443 = await probeTcpPort(host, 443, 700);
      return open443 ? host : null;
    }),
  );
  return results.find((h): h is string => Boolean(h)) ?? null;
}

/**
 * Resolve direct IPP endpoint for a Windows Wi‑Fi/IPP printer (SELPHY).
 * Reads PnP metadata + Canon MAC ARP neighbors, then probes TCP 631 so a
 * stale Windows IP (e.g. .103 after DHCP moved to .108) is skipped.
 */
export async function resolvePrinterIppEndpoint(
  printerName: string,
  opts?: { force?: boolean; preferredHost?: string },
): Promise<IppEndpoint | null> {
  if (process.platform !== "win32") return null;
  const preferredHost = normalizePrinterHost(opts?.preferredHost || "");
  const key = [
    printerName.trim().toLowerCase() || DEFAULT_PRINTER_NAME.toLowerCase(),
    preferredHost || "-",
  ].join("|");
  const cached = ippEndpointCache.get(key);
  if (
    !opts?.force &&
    cached &&
    Date.now() - cached.at < IPP_CACHE_TTL_MS
  ) {
    // Re-validate cached host quickly — SELPHY DHCP can move overnight.
    if (cached.endpoint?.ip || cached.endpoint?.url) {
      let host = cached.endpoint.ip || "";
      try {
        host = host || new URL(cached.endpoint.url).hostname;
      } catch {
        /* ignore */
      }
      if (host && (await probeTcpPort(host, 631, 600))) {
        return cached.endpoint;
      }
    } else if (cached.endpoint === null) {
      // Don't cache-miss past an Admin Printer IP — DHCP / sleep can recover.
      if (preferredHost) return endpointFromHost(preferredHost);
      return null;
    }
    // Stale cache (printer moved) — rediscover below.
  }

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$want = ${JSON.stringify(printerName.trim() || DEFAULT_PRINTER_NAME)}
$urls = New-Object System.Collections.Generic.List[string]
$ips = New-Object System.Collections.Generic.List[string]
$macIps = New-Object System.Collections.Generic.List[string]

$devices = @(Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object {
  $_.FriendlyName -eq $want -or
  ($want -match 'SELPHY|CP1500' -and $_.FriendlyName -match 'SELPHY|CP1500')
})
if (-not $devices.Count) {
  $devices = @(Get-PnpDevice -FriendlyName '*SELPHY*' -ErrorAction SilentlyContinue)
}

foreach ($d in $devices) {
  Get-PnpDeviceProperty -InstanceId $d.InstanceId -ErrorAction SilentlyContinue | ForEach-Object {
    $data = [string]$_.Data
    if (-not $data) { return }
    [regex]::Matches($data, 'https?://[0-9.]+(?::\\d+)?/ipp/print') | ForEach-Object {
      [void]$urls.Add($_.Value)
    }
    [regex]::Matches($data, 'ipps?://[0-9.]+(?::\\d+)?/ipp/print') | ForEach-Object {
      $u = $_.Value -replace '^ipps://','https://' -replace '^ipp://','http://'
      [void]$urls.Add($u)
    }
    if ($data -match 'https?://(\\d{1,3}(?:\\.\\d{1,3}){3})') {
      [void]$ips.Add($Matches[1])
    }
    # Prefer braced IPv4 lists from PnP (e.g. {192.168.18.103}); skip UUID fragments.
    if ($data -match '^\\{(\\d{1,3}(?:\\.\\d{1,3}){3})\\}$') {
      [void]$ips.Add($Matches[1])
    }
  }
}

# WSD port → Printer UUID → often same container as IPP device
try {
  $p = Get-Printer -Name $want -ErrorAction SilentlyContinue
  if ($p -and $p.PortName -like 'WSD-*') {
    $portKey = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Monitors\\WSD Port\\Ports\\$($p.PortName)"
    $uuid = (Get-ItemProperty $portKey -ErrorAction SilentlyContinue).'Printer UUID'
    if ($uuid) {
      $ippId = "SWD\\IPP\\$uuid"
      Get-PnpDeviceProperty -InstanceId $ippId -ErrorAction SilentlyContinue | ForEach-Object {
        $data = [string]$_.Data
        if (-not $data) { return }
        if ($data -match 'https?://[0-9.]+(?::\\d+)?/ipp/print') {
          [regex]::Matches($data, 'https?://[0-9.]+(?::\\d+)?/ipp/print') | ForEach-Object {
            [void]$urls.Add($_.Value)
          }
        }
        if ($data -match 'https?://(\\d{1,3}(?:\\.\\d{1,3}){3})') {
          [void]$ips.Add($Matches[1])
        }
        if ($data -match '^\\{(\\d{1,3}(?:\\.\\d{1,3}){3})\\}$') {
          [void]$ips.Add($Matches[1])
        }
      }
    }
  }
} catch {}

# Canon SELPHY Wi‑Fi OUI — ARP/NetNeighbor often has the live DHCP IP when
# Windows PnP still lists a stale address.
try {
  Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.LinkLayerAddress -like '${CANON_SELPHY_MAC_PREFIX}*' -and
      $_.State -notin @('Unreachable','Incomplete','Permanent')
    } |
    ForEach-Object { [void]$macIps.Add([string]$_.IPAddress) }
} catch {}

[pscustomobject]@{
  urls = @($urls | Select-Object -Unique)
  ips = @($ips | Select-Object -Unique)
  macIps = @($macIps | Select-Object -Unique)
} | ConvertTo-Json -Compress
`;

  let endpoint: IppEndpoint | null = null;
  try {
    const { stdout } = await runPowerShell(script, 12_000);
    const text = stdout.trim();
    const urls: string[] = [];
    const pnpIps: string[] = [];
    const macIps: string[] = [];
    if (text) {
      const parsed = JSON.parse(text) as {
        urls?: string[];
        ips?: string[];
        macIps?: string[];
      };
      if (Array.isArray(parsed.urls)) urls.push(...parsed.urls.map(String));
      if (Array.isArray(parsed.ips)) {
        pnpIps.push(...parsed.ips.map(String).filter(isLikelyLanIpv4));
      }
      if (Array.isArray(parsed.macIps)) {
        macIps.push(...parsed.macIps.map(String).filter(isLikelyLanIpv4));
      }
    }

    const urlHosts = urls
      .map((u) => {
        try {
          return new URL(u).hostname;
        } catch {
          return "";
        }
      })
      .filter(isLikelyLanIpv4);

    // Prefer Admin override, then live Canon MAC ARP, then PnP/URL hosts.
    const orderedHosts = [
      preferredHost,
      ...macIps,
      ...urlHosts,
      ...pnpIps,
    ].filter(Boolean);

    const reachable = await firstReachableIppHost(orderedHosts);
    if (reachable) {
      const matchingUrl = pickBestIppUrl(
        urls.filter((u) => {
          try {
            return new URL(u).hostname === reachable;
          } catch {
            return false;
          }
        }),
        reachable,
      );
      const url =
        matchingUrl ||
        (await probeTcpPort(reachable, 631, 500)
          ? `http://${reachable}:631/ipp/print`
          : `https://${reachable}:443/ipp/print`);
      endpoint = {
        url,
        ip: isLikelyLanIpv4(reachable) ? reachable : undefined,
        printerUri: url.replace(/^https:/i, "ipp:").replace(/^http:/i, "ipp:"),
      };
    } else if (preferredHost) {
      // Admin set an IP — use it even if probe failed (firewall quirks).
      endpoint = endpointFromHost(preferredHost);
    }
  } catch {
    endpoint = preferredHost ? endpointFromHost(preferredHost) : null;
  }

  ippEndpointCache.set(key, { endpoint, at: Date.now() });
  return endpoint;
}

/** Admin UI helper: detected live SELPHY IPP host (if any). */
export async function detectSelphyIppHost(
  printerName?: string,
): Promise<{ ip: string | null; url: string | null }> {
  if (process.platform !== "win32") {
    return { ip: null, url: null };
  }
  const preferred = await resolvePrinterHost();
  const endpoint = await resolvePrinterIppEndpoint(
    printerName?.trim() || DEFAULT_PRINTER_NAME,
    { force: true, preferredHost: preferred || undefined },
  );
  return {
    ip: endpoint?.ip || null,
    url: endpoint?.url || null,
  };
}

function isIppTransportTimeout(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /IPP print timed out|ETIMEDOUT|ESOCKETTIMEDOUT/i.test(msg);
}

function ippBodyWasFinished(err: unknown): boolean {
  return Boolean((err as { bodyFinished?: boolean } | null)?.bodyFinished);
}

function isIppConnectFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ENOTFOUND|ECONNRESET|connect /i.test(
    msg,
  );
}

/**
 * Send JPEG directly to SELPHY via IPP Print-Job (AirPrint/IPP Everywhere).
 * Avoids Windows “Waiting for printer connection…” on Microsoft IPP/WSD queues.
 *
 * SELPHY often ACKs slowly (~30–40s) while the postcard is already printing.
 * Wait long enough for that ACK; if the socket times out after the body was
 * written, treat as accepted (do not report “Printer not ready”).
 */
export async function printJpegViaIpp(
  jpeg: Buffer,
  endpoint: IppEndpoint,
  opts?: { timeoutMs?: number; jobName?: string },
): Promise<string> {
  if (jpeg.length < 1_024) {
    throw new Error("IPP print image is empty or too small");
  }
  // One attempt budget covers slow SELPHY Wi‑Fi ACK while the job prints.
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  const jobName = opts?.jobName || "Future ID Postcard";
  const body = buildIppPrintJob(jpeg, endpoint.printerUri, jobName);
  const started = Date.now();
  const deadline = started + timeoutMs;

  // SELPHY is single-job; a prior print can return server-error-busy briefly.
  let lastDetail = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 1_500) break;
    if (attempt > 0) {
      const pause = Math.min(1_200 * attempt, remaining - 500);
      if (pause > 0) await new Promise((r) => setTimeout(r, pause));
    }
    const attemptTimeout = Math.max(1_500, deadline - Date.now());
    try {
      const { buf } = await postIpp(endpoint.url, body, attemptTimeout);
      const parsed = parseIppStatus(buf);
      if (parsed.ok) {
        return `ok ipp=${endpoint.url} job=${parsed.detail} ms=${Date.now() - started}`;
      }
      lastDetail = parsed.detail;
      // 0x0507 server-error-busy — wait and retry (job was not accepted)
      if (parsed.status === 0x0507) continue;
      throw new Error(
        `IPP Print-Job failed (${parsed.detail}). ${selphyWifiStaffHint()}.`,
      );
    } catch (e) {
      if (isIppTransportTimeout(e) && ippBodyWasFinished(e)) {
        // Full Print-Job body reached the printer; SELPHY often holds the
        // HTTP socket open while printing. Do not claim “not ready”.
        return `ok ipp=${endpoint.url} job=accepted-slow-ack ms=${Date.now() - started}`;
      }
      // Pre-submit timeout / connect failure — retry while budget remains.
      if (isIppTransportTimeout(e) && attempt < 3) continue;
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  throw new Error(
    `IPP Print-Job failed (${lastDetail || "printer busy"}). ${selphyWifiStaffHint()}.`,
  );
}

async function ensureJpegBytes(
  bytes: Buffer,
  ext: "png" | "jpg" | "webp",
): Promise<Buffer> {
  if (ext === "jpg") return bytes;
  if (ext === "png") return pngBufferToJpeg(bytes);
  // WebP → PNG via .NET then JPEG is heavy; try Drawing load+jpeg in one PS pass.
  const dir = await mkdtemp(join(tmpdir(), "future-id-webp-jpg-"));
  const inPath = join(dir, `in.${ext}`);
  const outPath = join(dir, "out.jpg");
  await writeFile(inPath, bytes);
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile(${JSON.stringify(inPath)})
try {
  $img.Save(${JSON.stringify(outPath)}, [System.Drawing.Imaging.ImageFormat]::Jpeg)
} finally {
  $img.Dispose()
}
`;
  try {
    await runPowerShell(script, 10_000);
    const jpeg = await readFile(outPath);
    if (jpeg.length < 1_024) throw new Error("JPEG too small");
    return jpeg;
  } finally {
    try {
      await unlink(inPath);
    } catch {
      /* ignore */
    }
    try {
      await unlink(outPath);
    } catch {
      /* ignore */
    }
  }
}

async function printPostcardFileBytes(
  bytes: Buffer,
  ext: "png" | "jpg" | "webp",
  printerName: string,
) {
  if (process.platform !== "win32") {
    throw new Error(BOOTH_NETWORK_ERROR);
  }

  const preferredHost = await resolvePrinterHost();
  const { resolved, match, printers } = await resolveInstalledPrinter(printerName);

  if (match.workOffline) {
    const cleared = await tryClearWorkOffline(resolved);
    if (!cleared) {
      throw new Error(
        formatStaffPrintError(
          `Printer “${resolved}” is set to Work Offline.`,
          { resolved, softDriver: match.softDriver, printers },
        ),
      );
    }
  }

  // Re-check after clearing WorkOffline
  const after = (await listInstalledPrinters()).find(
    (p) => p.name.toLowerCase() === resolved.toLowerCase(),
  );
  const active = after ?? match;
  if (after && !after.ready && /\boffline\b/i.test(after.status)) {
    throw new Error(
      formatStaffPrintError(
        `Printer “${resolved}” is offline (${after.status}).`,
        { resolved, softDriver: active.softDriver, printers },
      ),
    );
  }
  if (after && /\bpaused\b/i.test(after.status)) {
    throw new Error(
      `Printer “${resolved}” is paused. Open its queue in Windows and resume printing.`,
    );
  }

  const soft = Boolean(active.softDriver);
  const preferIpp = soft || isSelphyName(resolved);

  // Wi‑Fi SELPHY: prefer direct IPP JPEG (works when Microsoft IPP/WSD hangs).
  if (preferIpp) {
    try {
      const endpoint = await resolvePrinterIppEndpoint(resolved, {
        preferredHost: preferredHost || undefined,
      });
      if (endpoint) {
        const jpeg = await ensureJpegBytes(bytes, ext);
        try {
          const spoolInfo = await printJpegViaIpp(jpeg, endpoint);
          return { printer_name: resolved, spool: spoolInfo, method: "ipp" as const };
        } catch (ippErr) {
          // Stale PnP IP / DHCP move — force rediscovery once.
          if (isIppConnectFailure(ippErr)) {
            const retry = await resolvePrinterIppEndpoint(resolved, {
              force: true,
              preferredHost: preferredHost || undefined,
            });
            if (retry && retry.url !== endpoint.url) {
              const spoolInfo = await printJpegViaIpp(jpeg, retry);
              return {
                printer_name: resolved,
                spool: spoolInfo,
                method: "ipp" as const,
              };
            }
            throw new Error(
              `SELPHY not reachable at ${endpoint.ip || endpoint.url} — ${selphyWifiStaffHint()}.`,
            );
          }
          throw ippErr;
        }
      } else if (preferredHost || soft) {
        throw new Error(
          `Could not reach SELPHY on Wi‑Fi — ${selphyWifiStaffHint()}.`,
        );
      }
    } catch (e) {
      // Fall through to Windows spooler only if IPP is unreachable / rejected.
      const ippMsg = e instanceof Error ? e.message : String(e);
      // Job rejected by printer — do not hide behind WSD hang.
      if (/IPP Print-Job failed|not reachable|Could not reach SELPHY/i.test(ippMsg)) {
        throw new Error(
          formatStaffPrintError(ippMsg, {
            resolved,
            softDriver: soft,
            printers,
          }),
        );
      }
      // Slow ACK after submit is already treated as success inside printJpegViaIpp.
      // Discovery / network miss → try spooler below, then surface SELPHY hint.
    }
  }

  const dir = await mkdtemp(join(tmpdir(), "future-id-print-"));
  // Prefer JPEG for soft/WSD queues — some Microsoft IPP drivers hang less on JPEG than PNG.
  let spoolExt: "png" | "jpg" | "webp" = ext;
  let spoolBytes = bytes;
  if (soft && ext === "png") {
    try {
      spoolBytes = await pngBufferToJpeg(bytes);
      spoolExt = "jpg";
    } catch {
      spoolBytes = bytes;
      spoolExt = ext;
    }
  }
  const filePath = join(dir, `postcard.${spoolExt}`);

  let spoolInfo = "";
  try {
    await writeFile(filePath, spoolBytes);
    spoolInfo = await printPngWindows(filePath, resolved, {
      softDriver: soft,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Soft queues that fail spooler: try one forced IPP rediscovery before giving up.
    if (preferIpp) {
      try {
        const endpoint = await resolvePrinterIppEndpoint(resolved, {
          force: true,
          preferredHost: preferredHost || undefined,
        });
        if (endpoint) {
          const jpeg = await ensureJpegBytes(bytes, ext);
          spoolInfo = await printJpegViaIpp(jpeg, endpoint);
          return {
            printer_name: resolved,
            spool: spoolInfo,
            method: "ipp" as const,
          };
        }
      } catch {
        /* keep original spooler error */
      }
    }
    throw new Error(
      formatStaffPrintError(message, {
        resolved,
        softDriver: soft,
        printers,
      }),
    );
  } finally {
    try {
      await unlink(filePath);
    } catch {
      /* ignore */
    }
  }

  if (!/^ok\b/i.test(spoolInfo)) {
    throw new Error(
      formatStaffPrintError(
        `Printer did not confirm the job. ${spoolInfo || "No spool feedback."}`,
        {
          resolved,
          softDriver: soft,
          printers,
        },
      ),
    );
  }

  return { printer_name: resolved, spool: spoolInfo || undefined, method: "spooler" as const };
}

export async function printPostcardPng(dataUrl: string, printerName: string) {
  const bytes = parsePngDataUrl(dataUrl);
  const withLogo = await withDohaMallLogoForPrint(bytes);
  const ext = imageExtFromBytes(withLogo);
  return printPostcardFileBytes(withLogo, ext, printerName);
}

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hashPassword, verifyPassword } from "@/lib/admin-auth.server";
import {
  canonicalUsernameForRole,
  navKeysForRole,
  normalizeAdminUsername,
  roleFromUsername,
  type AdminNavKey,
  type AdminRole,
} from "@/lib/admin-roles";
import { refreshSignedUrl } from "@/lib/image-upload";
import {
  ensureDefaultStaffUsers,
  findStaffUser,
  loadStaffUsers,
  staffPasswordForRole,
  toPublicStaffUsers,
  verifyStaffPassword,
} from "@/lib/staff-users.server";

export type SettingKey =
  | "freepik_api_key"
  | "event_name"
  | "admin_username"
  | "admin_password_hash"
  | "doha_mall_logo_path"
  | "doha_mall_logo_url"
  | "printer_name"
  | "printer_host"
  | "booth_print_base_url"
  | "print_worker_heartbeat";

const SECRET_KEYS = new Set<SettingKey>(["freepik_api_key", "admin_password_hash"]);

export async function getSetting(key: SettingKey): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.value ?? "";
}

export async function setSetting(key: SettingKey, value: string) {
  const { error } = await supabaseAdmin.from("app_settings").upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function getAdminUsername() {
  const fromDb = await getSetting("admin_username");
  return fromDb || process.env.ADMIN_USERNAME || "admin";
}

export async function verifyAdminCredentials(
  username: string,
  password: string,
) {
  const expectedUsername = await getAdminUsername();
  if (username !== expectedUsername) return false;

  const hash = await getSetting("admin_password_hash");
  if (hash) return verifyPassword(password, hash);

  const bootstrap = process.env.ADMIN_PASSWORD || "admin123";
  return password === bootstrap;
}

export type AuthenticatedAdminUser = {
  username: string;
  role: AdminRole;
  pages: AdminNavKey[];
};

/** Resolve Operation / Doha Mall / full admin credentials. */
export async function authenticateAdminUser(
  username: string,
  password: string,
): Promise<AuthenticatedAdminUser | null> {
  const staff = await loadStaffUsers();
  const staffMatch = findStaffUser(staff, username);
  if (staffMatch) {
    if (!verifyStaffPassword(staffMatch, password)) return null;
    return {
      username: staffMatch.username,
      role: staffMatch.role,
      pages: staffMatch.pages,
    };
  }

  const ok = await verifyAdminCredentials(username.trim(), password);
  if (ok) {
    const canonical = await getAdminUsername();
    return {
      username: canonical,
      role: "admin",
      pages: [...navKeysForRole("admin")],
    };
  }

  // Until staff users are saved, keep the hardcoded Operation / Doha Mall logins.
  if (staff.length === 0) {
    const staffRole = roleFromUsername(username);
    if (staffRole === "operation" || staffRole === "dohamall") {
      if (password !== staffPasswordForRole(staffRole)) return null;
      return {
        username: canonicalUsernameForRole(staffRole, username),
        role: staffRole,
        pages: [...navKeysForRole(staffRole)],
      };
    }
  }

  return null;
}

/** Re-read current role/pages for a signed-in username. */
export async function resolveAdminSessionUser(
  username: string,
  fallbackRole: AdminRole,
  fallbackPages?: AdminNavKey[],
): Promise<AuthenticatedAdminUser | null> {
  const adminUsername = await getAdminUsername();
  if (normalizeAdminUsername(username) === normalizeAdminUsername(adminUsername)) {
    return {
      username: adminUsername,
      role: "admin",
      pages: [...navKeysForRole("admin")],
    };
  }

  const staff = await loadStaffUsers();
  const staffMatch = findStaffUser(staff, username);
  if (staffMatch) {
    return {
      username: staffMatch.username,
      role: staffMatch.role,
      pages: staffMatch.pages,
    };
  }

  if (staff.length > 0) return null;

  const pages =
    fallbackPages?.length ? fallbackPages : [...navKeysForRole(fallbackRole)];
  return { username, role: fallbackRole, pages };
}

export async function updateAdminPassword(password: string) {
  await setSetting("admin_password_hash", hashPassword(password));
}

export async function getFreepikApiKey() {
  const fromDb = (await getSetting("freepik_api_key")).trim();
  const fromEnv = (process.env.FREEPIK_API_KEY || "").trim();
  // Prefer a clean Magnific/Freepik key (typically starts with FPS_ or MS).
  const candidate = fromDb || fromEnv;
  return candidate.replace(/\s+/g, "").trim();
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `${"•".repeat(Math.min(value.length - 4, 12))}${value.slice(-4)}`;
}

/** Fresh signed URL for the mall logo when a path is stored. */
export async function resolveDohaMallLogoUrl(): Promise<{
  path: string;
  url: string;
}> {
  const path = (await getSetting("doha_mall_logo_path")).trim();
  if (!path) {
    const fallback = (await getSetting("doha_mall_logo_url")).trim();
    return { path: "", url: fallback };
  }

  const signed = await refreshSignedUrl("branding", path);
  if ("error" in signed) {
    const fallback = (await getSetting("doha_mall_logo_url")).trim();
    return { path, url: fallback };
  }

  // Keep cached URL in settings roughly in sync for admin preview.
  await setSetting("doha_mall_logo_url", signed.url);
  return { path, url: signed.url };
}

const DEFAULT_PRINTER_NAME = "Canon SELPHY CP1500";

/**
 * Normalize booth print server base (no trailing slash). Empty = same-origin.
 * Accepts bare LAN IPs (`192.168.x.x`), optional port, or full http(s) URLs.
 * Defaults http:// and port 8080 for IPv4 without an explicit port.
 */
export function normalizeBoothPrintBaseUrl(raw: string): string {
  let trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  // Staff sometimes paste the full print endpoint.
  trimmed = trimmed.replace(/\/api\/print\/?$/i, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(u.hostname);
    if (!u.port && u.protocol === "http:" && isIpv4) {
      u.port = "8080";
    }
    // Only origin + optional path prefix (no /api/print suffix).
    return `${u.origin}${u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

export async function getBrandingSettings() {
  const logo = await resolveDohaMallLogoUrl();
  const printerName =
    (await getSetting("printer_name")).trim() || DEFAULT_PRINTER_NAME;
  const printerHost = (await getSetting("printer_host")).trim();
  const boothPrintBaseUrl = normalizeBoothPrintBaseUrl(
    await getSetting("booth_print_base_url"),
  );
  return {
    doha_mall_logo_path: logo.path,
    doha_mall_logo_url: logo.url,
    printer_name: printerName,
    printer_host: printerHost,
    booth_print_base_url: boothPrintBaseUrl,
  };
}

export async function listPublicSettings() {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("key, value, updated_at")
    .order("key");

  if (error) throw new Error(error.message);

  const map = new Map((data ?? []).map((row) => [row.key, row]));

  const freepik = map.get("freepik_api_key")?.value || process.env.FREEPIK_API_KEY || "";
  const eventName =
    map.get("event_name")?.value ||
    "Future Me — E3 Career Photo Booth";
  const username = map.get("admin_username")?.value || process.env.ADMIN_USERNAME || "admin";
  const hasPassword =
    Boolean(map.get("admin_password_hash")?.value) ||
    Boolean(process.env.ADMIN_PASSWORD) ||
    true;

  const branding = await getBrandingSettings();
  const staffUsers = toPublicStaffUsers(await ensureDefaultStaffUsers());

  return {
    freepik_api_key: maskSecret(freepik),
    freepik_api_key_set: Boolean(freepik),
    event_name: eventName,
    admin_username: username,
    admin_password_set: hasPassword,
    doha_mall_logo_path: branding.doha_mall_logo_path,
    doha_mall_logo_url: branding.doha_mall_logo_url,
    printer_name: branding.printer_name,
    printer_host: branding.printer_host,
    booth_print_base_url: branding.booth_print_base_url,
    staff_users: staffUsers,
    updated_at: {
      freepik_api_key: map.get("freepik_api_key")?.updated_at ?? null,
      event_name: map.get("event_name")?.updated_at ?? null,
      admin_username: map.get("admin_username")?.updated_at ?? null,
      doha_mall_logo_path: map.get("doha_mall_logo_path")?.updated_at ?? null,
      printer_name: map.get("printer_name")?.updated_at ?? null,
      printer_host: map.get("printer_host")?.updated_at ?? null,
      booth_print_base_url: map.get("booth_print_base_url")?.updated_at ?? null,
    },
  };
}

export { SECRET_KEYS };

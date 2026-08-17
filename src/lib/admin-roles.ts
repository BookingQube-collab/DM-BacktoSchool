export type AdminRole = "admin" | "dohamall" | "operation";

export type AdminNavKey =
  | "dashboard"
  | "registrations"
  | "photos"
  | "stores"
  | "settings";

export const ADMIN_NAV_KEYS: readonly AdminNavKey[] = [
  "dashboard",
  "registrations",
  "photos",
  "stores",
  "settings",
];

export const BUILTIN_STAFF_IDS = ["operation", "dohamall"] as const;

const ROLE_NAV: Record<AdminRole, readonly AdminNavKey[]> = {
  admin: ["dashboard", "registrations", "photos", "stores", "settings"],
  dohamall: ["dashboard", "registrations", "photos", "stores"],
  operation: ["registrations", "photos", "stores"],
};

const NAV_KEY_SET = new Set<string>(ADMIN_NAV_KEYS);

export type PublicStaffUser = {
  id: string;
  username: string;
  role: AdminRole;
  pages: AdminNavKey[];
  password_set: boolean;
  updated_at: string | null;
};

export function parseAdminRole(value: unknown): AdminRole | null {
  if (value === "admin" || value === "dohamall" || value === "operation") {
    return value;
  }
  return null;
}

export function normalizeAdminUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

export function roleFromUsername(username: string): AdminRole | null {
  const key = normalizeAdminUsername(username);
  if (key === "operation" || key === "operations") return "operation";
  if (key === "dohamall" || key === "doha") return "dohamall";
  return null;
}

export function canonicalUsernameForRole(role: AdminRole, fallback: string) {
  if (role === "operation") return "operation";
  if (role === "dohamall") return "dohamall";
  return fallback;
}

export function displayNameForRole(role: AdminRole, username: string) {
  if (role === "operation") return "Operation";
  if (role === "dohamall") return "Doha Mall";
  return username;
}

export function navKeysForRole(role: AdminRole): readonly AdminNavKey[] {
  return ROLE_NAV[role];
}

export function normalizePages(
  role: AdminRole,
  pages?: readonly string[] | null,
): AdminNavKey[] {
  const unique: AdminNavKey[] = [];
  for (const page of pages ?? []) {
    if (!NAV_KEY_SET.has(page)) continue;
    const key = page as AdminNavKey;
    if (!unique.includes(key)) unique.push(key);
  }
  return unique.length > 0 ? unique : [...ROLE_NAV[role]];
}

export function roleCan(role: AdminRole, key: AdminNavKey): boolean {
  return ROLE_NAV[role].includes(key);
}

export function pagesCan(
  pages: readonly AdminNavKey[],
  key: AdminNavKey,
): boolean {
  return pages.includes(key);
}

export function homePathForPages(
  pages: readonly AdminNavKey[],
): "/admin" | "/admin/registrations" {
  return pages.includes("dashboard") ? "/admin" : "/admin/registrations";
}

export function homePathForRole(
  role: AdminRole,
  pages?: readonly AdminNavKey[],
): "/admin" | "/admin/registrations" {
  return homePathForPages(pages?.length ? pages : ROLE_NAV[role]);
}

export function canVisitAdminPath(
  role: AdminRole,
  pathname: string,
  pages?: readonly AdminNavKey[],
): boolean {
  const allowed = pages?.length ? pages : ROLE_NAV[role];
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin/login") return true;
  if (path === "/admin" || path === "/admin/") {
    return allowed.includes("dashboard");
  }
  if (path.startsWith("/admin/registrations")) {
    return allowed.includes("registrations");
  }
  if (path.startsWith("/admin/photos")) return allowed.includes("photos");
  if (path.startsWith("/admin/companies")) return allowed.includes("stores");
  if (path.startsWith("/admin/settings")) return allowed.includes("settings");
  return true;
}

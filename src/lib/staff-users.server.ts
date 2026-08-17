import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hashPassword, verifyPassword } from "@/lib/admin-auth.server";
import {
  BUILTIN_STAFF_IDS,
  canonicalUsernameForRole,
  navKeysForRole,
  normalizeAdminUsername,
  normalizePages,
  parseAdminRole,
  roleFromUsername,
  type AdminNavKey,
  type AdminRole,
  type PublicStaffUser,
} from "@/lib/admin-roles";

const STAFF_USERS_KEY = "staff_users";

export type StaffUserRecord = {
  id: string;
  username: string;
  password_hash: string;
  role: AdminRole;
  pages: AdminNavKey[];
  updated_at: string;
};

export type StaffUserWriteInput = {
  id?: string;
  username: string;
  password?: string;
  role: AdminRole;
  pages?: AdminNavKey[];
};

function newStaffId() {
  return `staff_${randomBytes(8).toString("hex")}`;
}

function staffPasswordForRole(role: Exclude<AdminRole, "admin">) {
  if (role === "operation") {
    return process.env.OPERATION_PASSWORD || "operation123";
  }
  return process.env.DOHAMALL_PASSWORD || "dohamall123";
}

function defaultStaffRecords(): StaffUserRecord[] {
  const now = new Date().toISOString();
  return (["operation", "dohamall"] as const).map((role) => ({
    id: role,
    username: canonicalUsernameForRole(role, role),
    password_hash: hashPassword(staffPasswordForRole(role)),
    role,
    pages: [...navKeysForRole(role)],
    updated_at: now,
  }));
}

function parseStaffRecord(raw: unknown): StaffUserRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const role = parseAdminRole(row.role);
  if (!role) return null;
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : null;
  const username =
    typeof row.username === "string" ? normalizeAdminUsername(row.username) : "";
  if (!id || !username) return null;
  const password_hash =
    typeof row.password_hash === "string" ? row.password_hash : "";
  const updated_at =
    typeof row.updated_at === "string" && row.updated_at
      ? row.updated_at
      : new Date().toISOString();
  return {
    id,
    username,
    password_hash,
    role,
    pages: normalizePages(
      role,
      Array.isArray(row.pages) ? row.pages.map(String) : null,
    ),
    updated_at,
  };
}

async function readStaffUsersJson(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", STAFF_USERS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value ?? "";
}

async function writeStaffUsers(users: StaffUserRecord[]) {
  const { error } = await supabaseAdmin.from("app_settings").upsert({
    key: STAFF_USERS_KEY,
    value: JSON.stringify(users),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export function toPublicStaffUsers(users: StaffUserRecord[]): PublicStaffUser[] {
  return users.map((user) => ({
    id: user.id,
    username: user.username,
    role: user.role,
    pages: user.pages,
    password_set: Boolean(user.password_hash),
    updated_at: user.updated_at || null,
  }));
}

export async function loadStaffUsers(): Promise<StaffUserRecord[]> {
  const raw = (await readStaffUsersJson()).trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseStaffRecord)
      .filter((row): row is StaffUserRecord => Boolean(row));
  } catch {
    return [];
  }
}

export async function ensureDefaultStaffUsers(): Promise<StaffUserRecord[]> {
  const existing = await loadStaffUsers();
  if (existing.length > 0) return existing;
  const seeded = defaultStaffRecords();
  await writeStaffUsers(seeded);
  return seeded;
}

export function findStaffUser(
  users: StaffUserRecord[],
  username: string,
): StaffUserRecord | undefined {
  const key = normalizeAdminUsername(username);
  const exact = users.find((user) => normalizeAdminUsername(user.username) === key);
  if (exact) return exact;
  const aliasRole = roleFromUsername(username);
  if (aliasRole !== "operation" && aliasRole !== "dohamall") return undefined;
  const builtin = users.find((user) => user.id === aliasRole);
  if (
    builtin &&
    normalizeAdminUsername(builtin.username) ===
      canonicalUsernameForRole(aliasRole, aliasRole)
  ) {
    return builtin;
  }
  return undefined;
}

export function verifyStaffPassword(user: StaffUserRecord, password: string) {
  if (!user.password_hash) return false;
  return verifyPassword(password, user.password_hash);
}

export async function saveStaffUsersFromInput(
  inputs: StaffUserWriteInput[],
  adminUsername: string,
): Promise<{ error: string } | { users: StaffUserRecord[] }> {
  const current = await loadStaffUsers();
  const currentById = new Map(current.map((user) => [user.id, user]));
  const adminKey = normalizeAdminUsername(adminUsername);
  const seenUsernames = new Set<string>();
  const seenIds = new Set<string>();
  const now = new Date().toISOString();
  const next: StaffUserRecord[] = [];

  for (const input of inputs) {
    const role = parseAdminRole(input.role);
    if (!role) {
      return { error: "Each staff user needs a valid role" };
    }
    const username = normalizeAdminUsername(input.username);
    if (!username) {
      return { error: "Each staff user needs a username" };
    }
    if (username === adminKey) {
      return { error: "Staff username cannot match the main admin username" };
    }
    if (seenUsernames.has(username)) {
      return { error: "Staff usernames must be unique" };
    }
    seenUsernames.add(username);

    const requestedId = input.id?.trim() || "";
    const existing =
      (requestedId && currentById.get(requestedId)) ||
      current.find((user) => normalizeAdminUsername(user.username) === username);
    const password = typeof input.password === "string" ? input.password : "";
    if (!existing && password.length < 6) {
      return { error: "New staff need a password of at least 6 characters" };
    }
    if (existing && password && password.length < 6) {
      return { error: "Password must be at least 6 characters" };
    }

    let id = existing?.id;
    if (!id) {
      id =
        (BUILTIN_STAFF_IDS as readonly string[]).includes(requestedId)
          ? requestedId
          : newStaffId();
    }
    if (seenIds.has(id)) id = newStaffId();
    seenIds.add(id);

    const pages = normalizePages(role, input.pages);
    const password_hash = password
      ? hashPassword(password)
      : existing?.password_hash || "";
    if (!password_hash) {
      return { error: "New staff need a password of at least 6 characters" };
    }

    next.push({
      id,
      username,
      password_hash,
      role,
      pages,
      updated_at:
        password ||
        !existing ||
        existing.username !== username ||
        existing.role !== role ||
        existing.pages.join(",") !== pages.join(",")
          ? now
          : existing.updated_at,
    });
  }

  await writeStaffUsers(next);
  return { users: next };
}

export { staffPasswordForRole };

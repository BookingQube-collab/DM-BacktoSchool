/**
 * Resolve Supabase config from the env names used by Lovable, Vite, Vercel
 * Supabase integration, and Next-style prefixes — without requiring re-entry.
 */

function trimDefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function fromProcess(...keys: string[]): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  for (const key of keys) {
    const value = trimDefined(process.env[key]);
    if (value) return value;
  }
  return undefined;
}

function fromImportMeta(...keys: string[]): string | undefined {
  const env = import.meta.env as Record<string, unknown>;
  for (const key of keys) {
    const value = trimDefined(env[key]);
    if (value) return value;
  }
  return undefined;
}

/** Project URL — public. */
export function getSupabaseUrl(): string | undefined {
  return (
    fromImportMeta("VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL") ||
    fromProcess(
      "SUPABASE_URL",
      "VITE_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    )
  );
}

/** Anon / publishable key — public. */
export function getSupabasePublishableKey(): string | undefined {
  return (
    fromImportMeta(
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ) ||
    fromProcess(
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "VITE_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    )
  );
}

/**
 * Service-role / secret key — server only.
 * Prefer classic service_role JWT; fall back to new `sb_secret_*` key name.
 */
export function getSupabaseServiceRoleKey(): string | undefined {
  return fromProcess("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
}

export function missingSupabaseEnvMessage(missing: string[]): string {
  return `Missing Supabase environment variable(s): ${missing.join(", ")}. Checked SUPABASE_URL / VITE_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY (or publishable/anon aliases).`;
}

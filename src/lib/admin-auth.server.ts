import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function sessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-admin-session-secret"
  );
}

function b64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${b64url(salt)}:${b64url(hash)}`;
}

export function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith("scrypt:")) return false;
  const [, saltB64, hashB64] = stored.split(":");
  if (!saltB64 || !hashB64) return false;
  const salt = fromB64url(saltB64);
  const expected = fromB64url(hashB64);
  const actual = scryptSync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

type SessionPayload = {
  sub: string;
  exp: number;
};

function sign(payload: SessionPayload) {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(
    createHmac("sha256", sessionSecret()).update(body).digest(),
  );
  return `${body}.${sig}`;
}

function verifyToken(token: string): SessionPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(
    createHmac("sha256", sessionSecret()).update(body).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as SessionPayload;
    if (!payload?.sub || !payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionCookie(username: string) {
  const token = sign({
    sub: username,
    exp: Date.now() + SESSION_TTL_MS,
  });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readSessionFromRequest(request: Request): SessionPayload | null {
  const raw = request.headers.get("cookie") ?? "";
  const match = raw
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const token = match.slice(COOKIE_NAME.length + 1);
  return verifyToken(token);
}

export function requireAdminSession(request: Request) {
  const session = readSessionFromRequest(request);
  if (!session) {
    return { ok: false as const, response: json({ error: "Unauthorized" }, 401) };
  }
  return { ok: true as const, session };
}

export function json(
  data: unknown,
  status = 200,
  headers?: HeadersInit,
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

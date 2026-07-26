import type { Env } from "../types";
import { CONFIG } from "../lib/config";
import { hmacHex, constantTimeEqual, randomBase64Url, base64UrlEncode, base64UrlDecode } from "../lib/crypto";
import { parseCookies, getClientIp } from "../lib/util";
import { jsonError } from "../lib/http";

/**
 * Generalized from the v1/early-v2 admin-only session system: same
 * HMAC-signed exp+nonce payload shape and __Host- cookie pattern, now
 * carrying a user id (`sub`) and role rank (`rank`, 0 = admin) so any
 * account -- not just the single shared admin secret -- can hold a
 * session. See migrations/0001_accounts.sql for the users/roles tables.
 */

const SESSION_COOKIE_NAME = "__Host-airtext_session";

export interface SessionPayload {
  sub: string;
  rank: number;
  exp: number;
  nonce: string;
}

export async function createSessionToken(secret: string, userId: string, roleRank: number): Promise<string> {
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: userId,
      rank: roleRank,
      exp: Math.floor(Date.now() / 1000) + CONFIG.ADMIN_SESSION_SECONDS,
      nonce: randomBase64Url(12),
    }),
  );
  const signature = await hmacHex(secret, `session:${payload}`);
  return `${payload}.${signature}`;
}

export function buildSessionCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export async function getSession(request: Request, env: Env): Promise<SessionPayload | null> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = await hmacHex(env.APP_SECRET, `session:${parts[0]}`);
  if (!constantTimeEqual(expected, parts[1])) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[0])) as SessionPayload;
    if (!(Number(payload.exp) > Math.floor(Date.now() / 1000))) return null;
    if (typeof payload.sub !== "string" || typeof payload.rank !== "number") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  return (await getSession(request, env)) !== null;
}

/**
 * `maxRank` is the highest (numerically largest) rank allowed through --
 * rank 0 (admin) always satisfies any check. Pass `requireMutationHeader`
 * for state-changing admin actions, same as the old requireAdmin.
 */
export async function requireRole(
  request: Request,
  env: Env,
  maxRank: number,
  requireMutationHeader = false,
): Promise<Response | null> {
  if (requireMutationHeader && request.headers.get("x-airtext-admin") !== "1") {
    return jsonError("Missing administrator request header.", 403, "ADMIN_HEADER_REQUIRED");
  }
  const session = await getSession(request, env);
  if (!session || session.rank > maxRank) {
    return jsonError("Authentication required.", 401, "AUTH_REQUIRED");
  }
  return null;
}

export async function requireAdmin(request: Request, env: Env, requireMutationHeader = false): Promise<Response | null> {
  return requireRole(request, env, 0, requireMutationHeader);
}

export async function getRoomId(request: Request, secret: string): Promise<string> {
  const ip = getClientIp(request);
  const digest = await hmacHex(secret, `room:${ip}`);
  return digest.slice(0, 40);
}

export async function getClientIpHash(request: Request, secret: string): Promise<string> {
  const ip = getClientIp(request);
  const digest = await hmacHex(secret, `client:${ip}`);
  return digest.slice(0, 32);
}

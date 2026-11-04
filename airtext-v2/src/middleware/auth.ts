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
  version?: number;
}

export async function createSessionToken(secret: string, userId: string, roleRank: number, version = 0): Promise<string> {
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: userId,
      rank: roleRank,
      version,
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
    const current = await env.DB.prepare(
      `SELECT r.rank, u.session_version FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND u.status = 'active'`,
    ).bind(payload.sub).first<{ rank: number; session_version: number }>();
    if (!current || current.rank !== payload.rank || current.session_version !== (payload.version ?? 0)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  return (await getSession(request, env)) !== null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  rank: number;
  roleName: string;
  roleDefaultLimits: string;
  customLimits: string | null;
}

interface AuthenticatedUserRow {
  id: string;
  email: string;
  display_name: string;
  rank: number;
  role_name: string;
  default_limits: string;
  custom_limits: string | null;
}

/** Loads the full user+role row for the current session, or null if not
 *  logged in / the session references a disabled or deleted account. */
export async function getAuthenticatedUser(request: Request, env: Env): Promise<AuthenticatedUser | null> {
  const session = await getSession(request, env);
  if (!session) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, r.rank, r.name AS role_name, r.default_limits, u.custom_limits
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? AND u.status = 'active'`,
  )
    .bind(session.sub)
    .first<AuthenticatedUserRow>();
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    rank: row.rank,
    roleName: row.role_name,
    roleDefaultLimits: row.default_limits,
    customLimits: row.custom_limits,
  };
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

/** A room/IP match is never ownership. Account-owned drops require an active
 *  authenticated session for that user; anonymous drops use the creator token. */
export async function isDropOwner(request: Request, env: Env, userId: string | null, tokenHash: string): Promise<boolean> {
  if (userId) {
    const user = await getAuthenticatedUser(request, env);
    return Boolean(user && user.id === userId);
  }
  const token = request.headers.get("x-airtext-owner");
  return Boolean(token && constantTimeEqual(await hmacHex(env.APP_SECRET, `delete:${token}`), tokenHash));
}

/** Authorizes editing or deleting a drop on `/api/item/:id` and `/api/file/:id`.
 *  - Account-owned drops (`userId !== null`) require an active session for `userId`
 *    (a leftover localStorage token after logout cannot edit or delete an account drop,
 *    and a signed-in owner can edit/delete from any device without needing localStorage).
 *  - Anonymous drops (`userId === null`) require the matching creator `deleteToken`. */
export async function authorizeDropMutation(
  request: Request,
  env: Env,
  userId: string | null,
  tokenHash: string,
  suppliedToken: string,
  actionVerb: "edit" | "delete",
  resourceNoun: "note" | "file",
): Promise<{ ok: true; by: "owner" | "creator"; user: AuthenticatedUser | null } | { ok: false; response: Response }> {
  const user = await getAuthenticatedUser(request, env);
  if (userId) {
    if (user && user.id === userId) {
      return { ok: true, by: "owner", user };
    }
    return {
      ok: false,
      response: jsonError(
        `Sign in as the owner of this ${resourceNoun} to ${actionVerb} it.`,
        403,
        "OWNER_AUTH_REQUIRED",
      ),
    };
  }
  const token = suppliedToken || request.headers.get("x-airtext-owner") || "";
  if (!token) {
    return { ok: false, response: jsonError("Delete token is required.", 401, "DELETE_TOKEN_REQUIRED") };
  }
  const suppliedHash = await hmacHex(env.APP_SECRET, `delete:${token}`);
  if (!constantTimeEqual(suppliedHash, tokenHash)) {
    return {
      ok: false,
      response: jsonError(
        `You can ${actionVerb} this ${resourceNoun} only from the browser that created it.`,
        403,
        "INVALID_DELETE_TOKEN",
      ),
    };
  }
  return { ok: true, by: "creator", user };
}

const UNSAFE_FETCH_DESTS = new Set(["image", "script", "style", "video", "audio", "iframe", "object", "embed"]);

/** Rejects link-prefetchers, preview bots, and cross-site subresource embeds from
 *  consuming burn-after-read drops or reading encrypted drops. */
export function isSafeDropOpenRequest(request: Request): boolean {
  const purpose = (
    request.headers.get("purpose") ||
    request.headers.get("sec-purpose") ||
    request.headers.get("x-purpose") ||
    request.headers.get("x-moz") ||
    ""
  ).toLowerCase();
  if (purpose.includes("prefetch") || purpose.includes("preview") || purpose.includes("prerender")) {
    return false;
  }
  const fetchSite = (request.headers.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite === "cross-site") {
    return false;
  }
  const fetchDest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();
  if (fetchDest && UNSAFE_FETCH_DESTS.has(fetchDest)) {
    return false;
  }
  return true;
}


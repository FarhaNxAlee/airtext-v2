import type { Env } from "../types";
import { CONFIG } from "../lib/config";
import { hmacHex, constantTimeEqual, randomBase64Url, base64UrlEncode, base64UrlDecode } from "../lib/crypto";
import { parseCookies, getClientIp } from "../lib/util";
import { jsonError } from "../lib/http";

/** Ported verbatim from airtext-worker-modern.js:1215-1303. */

export async function requireAdmin(
  request: Request,
  env: Env,
  requireMutationHeader = false,
): Promise<Response | null> {
  if (!env.ADMIN_PASSWORD || String(env.ADMIN_PASSWORD).length < 8) {
    return jsonError("Administrator access is not configured.", 503, "ADMIN_NOT_CONFIGURED");
  }
  if (requireMutationHeader && request.headers.get("x-airtext-admin") !== "1") {
    return jsonError("Missing administrator request header.", 403, "ADMIN_HEADER_REQUIRED");
  }
  if (!(await isAdminRequest(request, env))) {
    return jsonError("Administrator authentication required.", 401, "ADMIN_AUTH_REQUIRED");
  }
  return null;
}

export async function isAdminRequest(request: Request, env: Env): Promise<boolean> {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies["__Host-airtext_admin"];
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expected = await hmacHex(env.APP_SECRET, `admin-session:${parts[0]}`);
  if (!constantTimeEqual(expected, parts[1])) return false;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]));
    return Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function createAdminSessionToken(secret: string): Promise<string> {
  const payload = base64UrlEncode(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + CONFIG.ADMIN_SESSION_SECONDS,
      nonce: randomBase64Url(12),
    }),
  );
  const signature = await hmacHex(secret, `admin-session:${payload}`);
  return `${payload}.${signature}`;
}

export function buildAdminCookie(value: string, maxAge: number): string {
  return `__Host-airtext_admin=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
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

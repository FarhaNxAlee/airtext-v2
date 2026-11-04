import type { Env } from "../types";
import { randomBase64Url } from "../lib/crypto";

/** Ported verbatim from airtext-worker-modern.js:2518-2532. */

export interface CooldownResult {
  allowed: boolean;
  retryAfter: number;
}

export async function enforceCooldown(env: Env, key: string, cooldownSeconds: number): Promise<CooldownResult> {
  const now = Date.now();
  const claimed = await env.DB.prepare(
    `INSERT INTO rate_limits (key, expires_at) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET expires_at = excluded.expires_at
     WHERE rate_limits.expires_at <= ? RETURNING expires_at`,
  )
    .bind(key, now + cooldownSeconds * 1000, now)
    .first<{ expires_at: number }>();
  if (!claimed) {
    const existing = await env.DB.prepare("SELECT expires_at FROM rate_limits WHERE key = ?").bind(key).first<{ expires_at: number }>();
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((Number(existing?.expires_at || now) - now) / 1000)) };
  }
  return { allowed: true, retryAfter: 0 };
}

/** Checks whether the caller has exceeded `maxAttempts` active entries under `prefix:` in `rate_limits`. */
export async function checkWindowLimit(env: Env, prefix: string, maxAttempts: number): Promise<CooldownResult> {
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count, MAX(expires_at) AS latest FROM rate_limits WHERE key >= ? AND key < ? AND expires_at > ?",
  )
    .bind(`${prefix}:`, `${prefix};`, now)
    .first<{ count: number; latest: number | null }>();
  const count = Number(row?.count || 0);
  if (count >= maxAttempts) {
    const retryAfter = Math.max(1, Math.ceil((Number(row?.latest || now) - now) / 1000));
    return { allowed: false, retryAfter };
  }
  return { allowed: true, retryAfter: 0 };
}

/** Records a windowed attempt under `prefix:` that expires after `windowSeconds`. */
export async function recordWindowAttempt(env: Env, prefix: string, windowSeconds: number): Promise<void> {
  const now = Date.now();
  const entryKey = `${prefix}:${now}:${randomBase64Url(6)}`;
  await env.DB.prepare("INSERT OR IGNORE INTO rate_limits (key, expires_at) VALUES (?, ?)")
    .bind(entryKey, now + windowSeconds * 1000)
    .run();
}

/** Combined check + record for sliding-window rate limits. */
export async function enforceWindowLimit(
  env: Env,
  prefix: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<CooldownResult> {
  const status = await checkWindowLimit(env, prefix, maxAttempts);
  if (!status.allowed) return status;
  await recordWindowAttempt(env, prefix, windowSeconds);
  return { allowed: true, retryAfter: 0 };
}


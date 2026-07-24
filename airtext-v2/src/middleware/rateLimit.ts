import type { Env } from "../types";

/** Ported verbatim from airtext-worker-modern.js:2518-2532. */

export interface CooldownResult {
  allowed: boolean;
  retryAfter: number;
}

export async function enforceCooldown(env: Env, key: string, cooldownSeconds: number): Promise<CooldownResult> {
  const now = Date.now();
  const existing = await env.DB.prepare("SELECT expires_at FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ expires_at: number }>();
  if (existing && Number(existing.expires_at) > now) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((Number(existing.expires_at) - now) / 1000)),
    };
  }
  await env.DB.prepare(
    `INSERT INTO rate_limits (key, expires_at) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET expires_at = excluded.expires_at`,
  )
    .bind(key, now + cooldownSeconds * 1000)
    .run();
  return { allowed: true, retryAfter: 0 };
}

import type { Env } from "../types";
import { CONFIG } from "../lib/config";

/** Ported verbatim from airtext-worker-modern.js:1581-1619. */

let lastCleanupAt = 0;

export async function maybeCleanupD1(env: Env): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < 30 * 60 * 1000) return;
  lastCleanupAt = now;
  try {
    await purgeExpiredFiles(env, now);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM notes WHERE expires_at <= ?").bind(now),
      env.DB.prepare("DELETE FROM analytics WHERE at <= ?").bind(now - CONFIG.ANALYTICS_RETENTION_SECONDS * 1000),
      env.DB.prepare("DELETE FROM feedback WHERE created_at <= ?").bind(now - CONFIG.FEEDBACK_RETENTION_SECONDS * 1000),
      env.DB.prepare("DELETE FROM rate_limits WHERE expires_at <= ?").bind(now),
    ]);
  } catch (error) {
    console.warn("D1 cleanup skipped", error);
  }
}

export async function purgeExpiredFiles(env: Env, now: number): Promise<void> {
  try {
    const expired = await env.DB.prepare("SELECT id, r2_key FROM files WHERE expires_at <= ? LIMIT 200")
      .bind(now)
      .all<{ id: string; r2_key: string }>();
    const rows = expired.results || [];
    if (!rows.length) return;
    if (env.FILES_BUCKET) {
      const keys = rows.map((row) => String(row.r2_key)).filter(Boolean);
      try {
        await env.FILES_BUCKET.delete(keys);
      } catch (error) {
        console.warn("R2 cleanup skipped for some keys", error);
      }
    }
    await env.DB.prepare(`DELETE FROM files WHERE id IN (${rows.map(() => "?").join(",")})`)
      .bind(...rows.map((row) => row.id))
      .run();
  } catch (error) {
    console.warn("File cleanup skipped", error);
  }
}

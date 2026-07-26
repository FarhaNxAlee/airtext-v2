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
    const expiredGroups = await env.DB.prepare("SELECT id FROM file_groups WHERE expires_at <= ? LIMIT 200")
      .bind(now)
      .all<{ id: string }>();
    const groupIds = (expiredGroups.results || []).map((row) => row.id);
    if (!groupIds.length) return;
    const placeholders = groupIds.map(() => "?").join(",");

    const filesToDelete = await env.DB.prepare(`SELECT r2_key FROM files WHERE group_id IN (${placeholders})`)
      .bind(...groupIds)
      .all<{ r2_key: string }>();
    const keys = (filesToDelete.results || []).map((row) => String(row.r2_key)).filter(Boolean);
    if (env.FILES_BUCKET && keys.length) {
      try {
        await env.FILES_BUCKET.delete(keys);
      } catch (error) {
        console.warn("R2 cleanup skipped for some keys", error);
      }
    }

    // Explicit deletes on both tables -- don't rely solely on the FK cascade.
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM files WHERE group_id IN (${placeholders})`).bind(...groupIds),
      env.DB.prepare(`DELETE FROM file_groups WHERE id IN (${placeholders})`).bind(...groupIds),
    ]);
  } catch (error) {
    console.warn("File cleanup skipped", error);
  }
}

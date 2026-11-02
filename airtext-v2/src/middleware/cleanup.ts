import type { Env } from "../types";
import { CONFIG } from "../lib/config";
import { deleteObjectsReliably } from "../lib/r2";

let lastCleanupAt = 0;

export async function maybeCleanupD1(env: Env): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < 30 * 60 * 1000) return;
  try { await cleanupD1(env, now); lastCleanupAt = now; }
  catch (error) { console.warn("Cleanup will retry", String(error)); }
}

/** Also invoked by Cron, so deletion doesn't depend on visitor traffic. */
export async function cleanupD1(env: Env, now = Date.now()): Promise<void> {
  await purgeExpiredFiles(env, now);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM notes WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM analytics WHERE at <= ?").bind(now - CONFIG.ANALYTICS_RETENTION_SECONDS * 1000),
    env.DB.prepare("DELETE FROM feedback WHERE created_at <= ?").bind(now - CONFIG.FEEDBACK_RETENTION_SECONDS * 1000),
    env.DB.prepare("DELETE FROM audit_log WHERE created_at <= ?").bind(now - 30 * 86_400_000),
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at <= ?").bind(now),
  ]);
  const consumed = await env.DB.prepare("SELECT r2_key FROM files WHERE consumed_at IS NOT NULL AND consumed_at <= ? LIMIT 200").bind(now - 10 * 60_000).all<{r2_key:string}>();
  await deleteObjectsReliably(env, (consumed.results || []).map((row) => row.r2_key));
  const pending = await env.DB.prepare("SELECT r2_key FROM object_deletions ORDER BY created_at LIMIT 200").all<{r2_key:string}>();
  await deleteObjectsReliably(env, (pending.results || []).map((row) => row.r2_key));
}

export async function purgeExpiredFiles(env: Env, now: number): Promise<void> {
  // Bounded batches keep the scheduled handler responsive under backlog.
  for (let batch = 0; batch < 5; batch++) {
    const groups = await env.DB.prepare("SELECT id FROM file_groups WHERE expires_at <= ? LIMIT 100").bind(now).all<{id:string}>();
    const ids = (groups.results || []).map((row) => row.id);
    if (!ids.length) break;
    const placeholders = ids.map(() => "?").join(",");
    const files = await env.DB.prepare(`SELECT r2_key FROM files WHERE group_id IN (${placeholders})`).bind(...ids).all<{r2_key:string}>();
    const keys = (files.results || []).map((row) => row.r2_key);
    await env.DB.batch([
      ...keys.map((key) => env.DB.prepare("INSERT OR IGNORE INTO object_deletions (r2_key,created_at) VALUES (?,?)").bind(key,now)),
      env.DB.prepare(`DELETE FROM files WHERE group_id IN (${placeholders})`).bind(...ids),
      env.DB.prepare(`DELETE FROM file_groups WHERE id IN (${placeholders})`).bind(...ids),
    ]);
    await deleteObjectsReliably(env, keys);
  }
}

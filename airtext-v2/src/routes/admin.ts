import { Hono } from "hono";
import type { Env } from "../types";
import { CONFIG } from "../lib/config";
import { getSiteSettings, sanitizeSettings, setSiteSettingsCache } from "../lib/settings";
import { jsonResponse, jsonError, readJsonBody } from "../lib/http";
import { hmacHex, constantTimeEqual } from "../lib/crypto";
import { getClientIpHash, requireAdmin, isAdminRequest, createAdminSessionToken, buildAdminCookie } from "../middleware/auth";
import { enforceCooldown } from "../middleware/rateLimit";
import { recordEvent } from "../lib/analytics";
import { getNoteById } from "./notes";
import { getFileById } from "./files";

/** Ported from airtext-worker-modern.js:793-797, 830-836, 2328-2516. */

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.get("/api/admin/session", async (c) => {
  const env = c.env;
  const configured = Boolean(env.ADMIN_PASSWORD && String(env.ADMIN_PASSWORD).length >= 8);
  const authenticated = configured ? await isAdminRequest(c.req.raw, env) : false;
  return jsonResponse({ ok: true, configured, authenticated });
});

adminRoutes.post("/api/admin/login", async (c) => {
  const env = c.env;
  if (!env.ADMIN_PASSWORD || String(env.ADMIN_PASSWORD).length < 8) {
    return jsonError("Add an ADMIN_PASSWORD secret with at least 8 characters.", 503, "ADMIN_NOT_CONFIGURED");
  }
  const body = await readJsonBody<{ password?: string }>(c.req.raw, 2_000);
  if (!body.ok) return body.response;
  const password = typeof body.data.password === "string" ? body.data.password : "";
  const clientHash = await getClientIpHash(c.req.raw, env.APP_SECRET);
  const cooldown = await enforceCooldown(env, `admin:${clientHash}`, 3);
  if (!cooldown.allowed) {
    return jsonError(`Please wait ${cooldown.retryAfter} seconds and try again.`, 429, "ADMIN_RATE_LIMIT");
  }
  const supplied = await hmacHex(env.APP_SECRET, `admin-password:${password}`);
  const expected = await hmacHex(env.APP_SECRET, `admin-password:${env.ADMIN_PASSWORD}`);
  if (!constantTimeEqual(supplied, expected)) {
    await recordEvent(env, c.req.raw, "admin_login_failed");
    return jsonError("Incorrect administrator password.", 401, "INVALID_ADMIN_PASSWORD");
  }
  const token = await createAdminSessionToken(env.APP_SECRET);
  await recordEvent(env, c.req.raw, "admin_login");
  return jsonResponse(
    { ok: true, message: "Signed in." },
    200,
    { "set-cookie": buildAdminCookie(token, CONFIG.ADMIN_SESSION_SECONDS) },
  );
});

adminRoutes.post("/api/admin/logout", () => {
  return jsonResponse({ ok: true, message: "Signed out." }, 200, { "set-cookie": buildAdminCookie("", 0) });
});

adminRoutes.get("/api/admin/dashboard", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env);
  if (authError) return authError;
  const settings = await getSiteSettings(env);
  const now = Date.now();
  const startDate = new Date(now - 6 * 86_400_000).toISOString().slice(0, 10);
  const results = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, title, locked, code, created_at, expires_at, substr(room_id, 1, 12) AS room_hash
       FROM notes WHERE expires_at > ? ORDER BY created_at DESC LIMIT 100`,
    ).bind(now),
    env.DB.prepare("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100"),
    env.DB.prepare("SELECT type, COUNT(*) AS count FROM analytics GROUP BY type"),
    env.DB.prepare("SELECT date, COUNT(*) AS count FROM analytics WHERE date >= ? GROUP BY date").bind(startDate),
    env.DB.prepare("SELECT COUNT(DISTINCT network) AS count FROM analytics"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM notes WHERE expires_at > ?").bind(now),
    env.DB.prepare(
      `SELECT id, title, filename, mime, size_bytes, locked, code, download_count, created_at, expires_at,
              substr(room_id, 1, 12) AS room_hash
       FROM files WHERE expires_at > ? ORDER BY created_at DESC LIMIT 100`,
    ).bind(now),
    env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM files WHERE expires_at > ?").bind(now),
  ]);

  interface NoteRow { id: string; title: string; locked: number; code: string; created_at: number; expires_at: number; room_hash: string }
  interface FeedbackRow { id: string; category: string; message: string; email: string; rating: number; status: string; created_at: number; updated_at: number }
  interface FileRow { id: string; title: string; filename: string; mime: string; size_bytes: number; locked: number; code: string; download_count: number; created_at: number; expires_at: number; room_hash: string }

  const notesRows = (results[0].results || []) as unknown as NoteRow[];
  const feedbackRows = (results[1].results || []) as unknown as FeedbackRow[];
  const filesRows = (results[6].results || []) as unknown as FileRow[];
  const fileTotals = ((results[7].results || [])[0] as { count?: number; bytes?: number } | undefined) || { count: 0, bytes: 0 };

  const counts: Record<string, number> = Object.create(null);
  for (const row of (results[2].results || []) as { type: string; count: number }[]) {
    counts[String(row.type)] = Number(row.count || 0);
  }
  const chartMap: Record<string, number> = Object.create(null);
  for (const row of (results[3].results || []) as { date: string; count: number }[]) {
    chartMap[String(row.date)] = Number(row.count || 0);
  }
  const chart: { date: string; count: number }[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now - offset * 86_400_000).toISOString().slice(0, 10);
    chart.push({ date, count: chartMap[date] || 0 });
  }

  const notes = notesRows.map((row) => ({
    id: String(row.id),
    title: String(row.title || "Untitled"),
    locked: Boolean(row.locked),
    code: String(row.code || ""),
    createdAt: Number(row.created_at || 0),
    expiresAt: Number(row.expires_at || 0),
    roomHash: String(row.room_hash || ""),
  }));
  const feedback = feedbackRows.map((row) => ({
    id: String(row.id),
    category: String(row.category || "other"),
    message: String(row.message || ""),
    email: String(row.email || ""),
    rating: Number(row.rating || 0),
    status: String(row.status || "new"),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  }));
  const files = filesRows.map((row) => ({
    id: String(row.id),
    title: String(row.title || "Untitled"),
    filename: String(row.filename || "file"),
    mime: String(row.mime || "application/octet-stream"),
    sizeBytes: Number(row.size_bytes || 0),
    locked: Boolean(row.locked),
    code: String(row.code || ""),
    downloadCount: Number(row.download_count || 0),
    createdAt: Number(row.created_at || 0),
    expiresAt: Number(row.expires_at || 0),
    roomHash: String(row.room_hash || ""),
  }));

  const activeNotesCount = ((results[5].results || [])[0] as { count?: number } | undefined)?.count;
  const uniqueNetworksCount = ((results[4].results || [])[0] as { count?: number } | undefined)?.count;

  return jsonResponse({
    ok: true,
    settings,
    storage: {
      primary: "D1",
      kvRoutineWrites: 0,
      filesBucketConfigured: Boolean(env.FILES_BUCKET),
      fileStorageBytes: Number(fileTotals.bytes || 0),
      fileStorageLimitBytes: settings.maxTotalStorageMB * 1024 * 1024,
    },
    stats: {
      activeNotes: Number(activeNotesCount || notes.length),
      createdNotes: counts.note_created || 0,
      noteOpens: (counts.note_opened || 0) + (counts.shared_note_opened || 0),
      receivedOpens: counts.shared_note_opened || 0,
      feedbackTotal: feedback.length,
      feedbackNew: feedback.filter((item) => item.status === "new").length,
      uniqueNetworks: Number(uniqueNetworksCount || 0),
      pinFailures: counts.pin_failed || 0,
      activeFiles: Number(fileTotals.count || files.length),
      fileDownloads: counts.file_downloaded || 0,
    },
    eventCounts: counts,
    chart,
    notes,
    feedback,
    files,
  });
});

adminRoutes.patch("/api/admin/settings", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;
  const body = await readJsonBody(c.req.raw, 80_000);
  if (!body.ok) return body.response;
  const current = await getSiteSettings(env);
  const settings = sanitizeSettings({ ...current, ...body.data });
  await env.DB.prepare("UPDATE site_settings SET data = ?, updated_at = ? WHERE id = 1")
    .bind(JSON.stringify(settings), Date.now())
    .run();
  setSiteSettingsCache(settings);
  await recordEvent(env, c.req.raw, "settings_updated");
  return jsonResponse({ ok: true, settings, message: "Settings saved." });
});

adminRoutes.delete("/api/admin/item/:itemId", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;
  const item = await getNoteById(env, c.req.param("itemId"));
  if (!item) return jsonError("The note has expired or does not exist.", 404, "NOT_FOUND");
  await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(item.id).run();
  await recordEvent(env, c.req.raw, "note_deleted", { by: "admin" });
  return jsonResponse({ ok: true, message: "Note deleted." });
});

adminRoutes.delete("/api/admin/file/:fileId", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;
  const file = await getFileById(env, c.req.param("fileId"));
  if (!file) return jsonError("The file has expired or does not exist.", 404, "NOT_FOUND");
  await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(file.id).run();
  if (env.FILES_BUCKET) {
    await env.FILES_BUCKET.delete(file.r2Key).catch(() => {});
  }
  await recordEvent(env, c.req.raw, "file_deleted", { by: "admin" });
  return jsonResponse({ ok: true, message: "File deleted." });
});

adminRoutes.patch("/api/admin/feedback/:feedbackId", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;
  const body = await readJsonBody<{ status?: string }>(c.req.raw, 2_000);
  if (!body.ok) return body.response;
  const allowed = ["new", "reviewed", "resolved"];
  const status = allowed.includes(body.data.status as string) ? (body.data.status as string) : "";
  if (!status) return jsonError("Invalid feedback status.", 400, "INVALID_STATUS");
  const feedbackId = c.req.param("feedbackId");
  const result = await env.DB.prepare("UPDATE feedback SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, Date.now(), feedbackId)
    .run();
  if (!result.meta || Number(result.meta.changes || 0) < 1) {
    return jsonError("Feedback not found.", 404, "NOT_FOUND");
  }
  return jsonResponse({ ok: true, feedback: { id: feedbackId, status } });
});

adminRoutes.delete("/api/admin/feedback/:feedbackId", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;
  const result = await env.DB.prepare("DELETE FROM feedback WHERE id = ?").bind(c.req.param("feedbackId")).run();
  if (!result.meta || Number(result.meta.changes || 0) < 1) {
    return jsonError("Feedback not found.", 404, "NOT_FOUND");
  }
  return jsonResponse({ ok: true, message: "Feedback deleted." });
});

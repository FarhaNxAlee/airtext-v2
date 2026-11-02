import { Hono } from "hono";
import type { Env } from "../types";
import { CONFIG } from "../lib/config";
import { getSiteSettings, sanitizeSettings, setSiteSettingsCache } from "../lib/settings";
import { getEffectiveLimits } from "../lib/limits";
import { jsonResponse, jsonError, readJsonBody } from "../lib/http";
import { hashPassword, constantTimeEqual } from "../lib/crypto";
import { getClientIpHash, requireAdmin, getSession, getAuthenticatedUser, createSessionToken, buildSessionCookie } from "../middleware/auth";
import { enforceCooldown } from "../middleware/rateLimit";
import { recordEvent } from "../lib/analytics";
import { recordAudit } from "../lib/audit";
import type { NoteEditPatch } from "./notes";
import { getNoteById, applyNoteEdit, publicItemPayload } from "./notes";
import { getGroupById, deleteGroupAndFiles, applyFileGroupEdit, getFilesForGroup, publicGroupPayload } from "./files";

/** Ported from airtext-worker-modern.js:793-797, 830-836, 2328-2516; login/session
 *  now check the `users` table (role rank 0) instead of the ADMIN_PASSWORD secret --
 *  see migrations/0001_accounts.sql. */

export const adminRoutes = new Hono<{ Bindings: Env }>();

interface AdminUserRow {
  id: string;
  password_salt: string;
  password_hash: string;
  status: string;
  rank: number;
}

adminRoutes.get("/api/admin/session", async (c) => {
  const env = c.env;
  const adminExists = await env.DB.prepare(
    `SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id WHERE r.rank = 0 AND u.status = 'active' LIMIT 1`,
  ).first();
  const configured = Boolean(adminExists);
  const session = configured ? await getSession(c.req.raw, env) : null;
  const authenticated = session !== null && session.rank === 0;
  return jsonResponse({ ok: true, configured, authenticated });
});

adminRoutes.post("/api/admin/login", async (c) => {
  const env = c.env;
  const body = await readJsonBody<{ email?: string; password?: string }>(c.req.raw, 2_000);
  if (!body.ok) return body.response;
  const email = typeof body.data.email === "string" ? body.data.email.trim().toLowerCase() : "";
  const password = typeof body.data.password === "string" ? body.data.password : "";
  if (!email || !password) return jsonError("Email and password are required.", 400, "MISSING_CREDENTIALS");

  const clientHash = await getClientIpHash(c.req.raw, env.APP_SECRET);
  const cooldown = await enforceCooldown(env, `admin:${clientHash}`, 3);
  if (!cooldown.allowed) {
    return jsonError(`Please wait ${cooldown.retryAfter} seconds and try again.`, 429, "ADMIN_RATE_LIMIT");
  }

  const row = await env.DB.prepare(
    `SELECT u.id, u.password_salt, u.password_hash, u.status, r.rank
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.email = ? AND r.rank = 0`,
  )
    .bind(email)
    .first<AdminUserRow>();

  if (!row || row.status !== "active") {
    await recordEvent(env, c.req.raw, "admin_login_failed");
    return jsonError("Incorrect email or password.", 401, "INVALID_CREDENTIALS");
  }

  const suppliedHash = await hashPassword(env.APP_SECRET, row.password_salt, password);
  if (!constantTimeEqual(suppliedHash, row.password_hash)) {
    await recordEvent(env, c.req.raw, "admin_login_failed");
    return jsonError("Incorrect email or password.", 401, "INVALID_CREDENTIALS");
  }

  const token = await createSessionToken(env.APP_SECRET, row.id, row.rank);
  await env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
  await recordEvent(env, c.req.raw, "admin_login");
  return jsonResponse(
    { ok: true, message: "Signed in." },
    200,
    { "set-cookie": buildSessionCookie(token, CONFIG.ADMIN_SESSION_SECONDS) },
  );
});

adminRoutes.post("/api/admin/logout", () => {
  return jsonResponse({ ok: true, message: "Signed out." }, 200, { "set-cookie": buildSessionCookie("", 0) });
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
      `SELECT g.id, g.title, g.locked, g.code, g.total_size_bytes, g.created_at, g.expires_at,
              substr(g.room_id, 1, 12) AS room_hash,
              (SELECT COUNT(*) FROM files WHERE files.group_id = g.id) AS file_count,
              (SELECT COALESCE(SUM(download_count), 0) FROM files WHERE files.group_id = g.id) AS download_count
       FROM file_groups g WHERE g.expires_at > ? ORDER BY g.created_at DESC LIMIT 100`,
    ).bind(now),
    env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_size_bytes), 0) AS bytes FROM file_groups WHERE expires_at > ?").bind(now),
  ]);

  interface NoteRow { id: string; title: string; locked: number; code: string; created_at: number; expires_at: number; room_hash: string }
  interface FeedbackRow { id: string; category: string; message: string; email: string; rating: number; status: string; created_at: number; updated_at: number }
  interface FileRow { id: string; title: string; total_size_bytes: number; locked: number; code: string; download_count: number; file_count: number; created_at: number; expires_at: number; room_hash: string }

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
    fileCount: Number(row.file_count || 0),
    totalSizeBytes: Number(row.total_size_bytes || 0),
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

  // Diff before/after for the audit log -- only the keys that actually
  // changed, not the whole ~60-key settings object, since `current` is
  // already loaded and this comparison is free.
  const currentRecord = current as Record<string, unknown>;
  const settingsRecord = settings as Record<string, unknown>;
  const changedKeys = Object.keys(settings).filter((key) => currentRecord[key] !== settingsRecord[key]);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of changedKeys) {
    before[key] = currentRecord[key];
    after[key] = settingsRecord[key];
  }

  // UPSERT, not UPDATE: v1's ensureD1Schema() re-seeded this row on every
  // request so an UPDATE could never silently no-op; v2 only seeds it once
  // via the baseline migration, so a fresh/empty DB must self-heal here.
  await env.DB.prepare(
    `INSERT INTO site_settings (id, data, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  )
    .bind(JSON.stringify(settings), Date.now())
    .run();
  setSiteSettingsCache(settings);
  await recordEvent(env, c.req.raw, "settings_updated");
  const session = await getSession(c.req.raw, env);
  await recordAudit(env, {
    actorUserId: session?.sub ?? null,
    action: "settings_updated",
    targetType: "settings",
    before: changedKeys.length ? before : undefined,
    after: changedKeys.length ? after : undefined,
    ipHash: await getClientIpHash(c.req.raw, env.APP_SECRET),
  });
  return jsonResponse({ ok: true, settings, message: "Settings saved." });
});

adminRoutes.patch("/api/admin/item/:itemId", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;
  const note = await getNoteById(env, c.req.param("itemId"));
  if (!note) return jsonError("The note has expired or does not exist.", 404, "NOT_FOUND");
  const settings = await getSiteSettings(env);
  const requester = await getAuthenticatedUser(c.req.raw, env);
  const limits = await getEffectiveLimits(env, requester);
  const body = await readJsonBody<NoteEditPatch>(c.req.raw, Math.max(24_000, limits.maxTextLength + 2_000));
  if (!body.ok) return body.response;
  const before = { title: note.title, text: note.text, locked: note.locked, burnAfterRead: note.burnAfterRead, expiresAt: note.expiresAt };
  const result = await applyNoteEdit(env, note, body.data, limits, settings);
  if (!result.ok) return result.response;
  await recordEvent(env, c.req.raw, "note_edited", { by: "admin" });
  const session = await getSession(c.req.raw, env);
  await recordAudit(env, {
    actorUserId: session?.sub ?? null,
    action: "note_edited",
    targetType: "note",
    targetId: note.id,
    before,
    after: {
      title: result.note.title, text: result.note.text, locked: result.note.locked,
      burnAfterRead: result.note.burnAfterRead, expiresAt: result.note.expiresAt,
    },
    ipHash: await getClientIpHash(c.req.raw, env.APP_SECRET),
  });
  return jsonResponse({ ...publicItemPayload(result.note, true), message: "Note updated." });
});

adminRoutes.delete("/api/admin/item/:itemId", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;
  const item = await getNoteById(env, c.req.param("itemId"));
  if (!item) return jsonError("The note has expired or does not exist.", 404, "NOT_FOUND");
  await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(item.id).run();
  await recordEvent(env, c.req.raw, "note_deleted", { by: "admin" });
  const session = await getSession(c.req.raw, env);
  await recordAudit(env, {
    actorUserId: session?.sub ?? null,
    action: "note_deleted",
    targetType: "note",
    targetId: item.id,
    before: { id: item.id, title: item.title, code: item.code },
    ipHash: await getClientIpHash(c.req.raw, env.APP_SECRET),
  });
  return jsonResponse({ ok: true, message: "Note deleted." });
});

adminRoutes.patch("/api/admin/file/:fileId", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;
  const group = await getGroupById(env, c.req.param("fileId"));
  if (!group) return jsonError("The file has expired or does not exist.", 404, "NOT_FOUND");
  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    return jsonError("Could not read the request. Please try again.", 400, "INVALID_UPLOAD");
  }
  const settings = await getSiteSettings(env);
  const requester = await getAuthenticatedUser(c.req.raw, env);
  const limits = await getEffectiveLimits(env, requester);
  const existingFiles = await getFilesForGroup(env, group.id);
  const before = { title: group.title, locked: group.locked, burnAfterRead: group.burnAfterRead, expiresAt: group.expiresAt, totalSizeBytes: group.totalSizeBytes };
  const result = await applyFileGroupEdit(env, group, existingFiles, form, limits, settings);
  if (!result.ok) return result.response;
  await recordEvent(env, c.req.raw, "file_edited", { by: "admin" });
  const session = await getSession(c.req.raw, env);
  await recordAudit(env, {
    actorUserId: session?.sub ?? null,
    action: "file_edited",
    targetType: "file",
    targetId: group.id,
    before,
    after: {
      title: result.group.title, locked: result.group.locked, burnAfterRead: result.group.burnAfterRead,
      expiresAt: result.group.expiresAt, totalSizeBytes: result.group.totalSizeBytes,
    },
    ipHash: await getClientIpHash(c.req.raw, env.APP_SECRET),
  });
  return jsonResponse({ ...(await publicGroupPayload(env, result.group, result.files, true)), message: "File updated." });
});

adminRoutes.delete("/api/admin/file/:fileId", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;
  const group = await getGroupById(env, c.req.param("fileId"));
  if (!group) return jsonError("The file has expired or does not exist.", 404, "NOT_FOUND");
  await deleteGroupAndFiles(env, group.id);
  await recordEvent(env, c.req.raw, "file_deleted", { by: "admin" });
  const session = await getSession(c.req.raw, env);
  await recordAudit(env, {
    actorUserId: session?.sub ?? null,
    action: "file_deleted",
    targetType: "file",
    targetId: group.id,
    before: { id: group.id, title: group.title, code: group.code, totalSizeBytes: group.totalSizeBytes },
    ipHash: await getClientIpHash(c.req.raw, env.APP_SECRET),
  });
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
  const session = await getSession(c.req.raw, env);
  await recordAudit(env, {
    actorUserId: session?.sub ?? null,
    action: "feedback_status_changed",
    targetType: "feedback",
    targetId: feedbackId,
    after: { status },
    ipHash: await getClientIpHash(c.req.raw, env.APP_SECRET),
  });
  return jsonResponse({ ok: true, feedback: { id: feedbackId, status } });
});

adminRoutes.delete("/api/admin/feedback/:feedbackId", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;
  const feedbackId = c.req.param("feedbackId");
  const result = await env.DB.prepare("DELETE FROM feedback WHERE id = ?").bind(feedbackId).run();
  if (!result.meta || Number(result.meta.changes || 0) < 1) {
    return jsonError("Feedback not found.", 404, "NOT_FOUND");
  }
  const session = await getSession(c.req.raw, env);
  await recordAudit(env, {
    actorUserId: session?.sub ?? null,
    action: "feedback_deleted",
    targetType: "feedback",
    targetId: feedbackId,
    ipHash: await getClientIpHash(c.req.raw, env.APP_SECRET),
  });
  return jsonResponse({ ok: true, message: "Feedback deleted." });
});

/**
 * Phase 8 (V3-PLAN.md section 7.8): split off from the monolithic
 * /api/admin/dashboard above (left untouched -- client/main.js still calls
 * it). These are additive, paginated/filterable replacements the admin UI
 * will migrate to in a later (client-side) work stream.
 */

adminRoutes.get("/api/admin/overview", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env);
  if (authError) return authError;
  const settings = await getSiteSettings(env);
  const now = Date.now();
  const oneDayAgo = now - 86_400_000;
  const currentPeriodStart = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
  const priorPeriodStart = new Date(now - 14 * 86_400_000).toISOString().slice(0, 10);

  const results = await env.DB.batch([
    // 0: all-time analytics type counts (same query dashboard uses for `stats`)
    env.DB.prepare("SELECT type, COUNT(*) AS count FROM analytics GROUP BY type"),
    // 1: active notes count
    env.DB.prepare("SELECT COUNT(*) AS count FROM notes WHERE expires_at > ?").bind(now),
    // 2: unique networks (all-time)
    env.DB.prepare("SELECT COUNT(DISTINCT network) AS count FROM analytics"),
    // 3: active files count + bytes
    env.DB.prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(total_size_bytes), 0) AS bytes FROM file_groups WHERE expires_at > ?",
    ).bind(now),
    // 4: this-7-days trend counts by type
    env.DB.prepare("SELECT type, COUNT(*) AS count FROM analytics WHERE date >= ? GROUP BY type").bind(
      currentPeriodStart,
    ),
    // 5: prior-7-days trend counts by type
    env.DB.prepare(
      "SELECT type, COUNT(*) AS count FROM analytics WHERE date >= ? AND date < ? GROUP BY type",
    ).bind(priorPeriodStart, currentPeriodStart),
    // 6: new feedback (any category)
    env.DB.prepare("SELECT COUNT(*) AS count FROM feedback WHERE status = 'new'"),
    // 7: pending account requests
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM feedback WHERE category = 'account_request' AND status = 'new'",
    ),
    // 8: failed admin logins in the last 24h (see admin_login_failed in this file)
    env.DB.prepare("SELECT COUNT(*) AS count FROM analytics WHERE type = 'admin_login_failed' AND at >= ?").bind(
      oneDayAgo,
    ),
    // 9: total feedback rows (all statuses/categories) -- same figure
    // dashboard's stats.feedbackTotal reports, just via COUNT(*) instead of
    // loading up to 100 rows to measure .length.
    env.DB.prepare("SELECT COUNT(*) AS count FROM feedback"),
  ]);

  const counts: Record<string, number> = Object.create(null);
  for (const row of (results[0].results || []) as { type: string; count: number }[]) {
    counts[String(row.type)] = Number(row.count || 0);
  }
  const activeNotesCount = Number(((results[1].results || [])[0] as { count?: number } | undefined)?.count || 0);
  const uniqueNetworksCount = Number(((results[2].results || [])[0] as { count?: number } | undefined)?.count || 0);
  const fileTotals = ((results[3].results || [])[0] as { count?: number; bytes?: number } | undefined) || {
    count: 0,
    bytes: 0,
  };
  const currentPeriod: Record<string, number> = Object.create(null);
  for (const row of (results[4].results || []) as { type: string; count: number }[]) {
    currentPeriod[String(row.type)] = Number(row.count || 0);
  }
  const priorPeriod: Record<string, number> = Object.create(null);
  for (const row of (results[5].results || []) as { type: string; count: number }[]) {
    priorPeriod[String(row.type)] = Number(row.count || 0);
  }
  const newFeedbackCount = Number(((results[6].results || [])[0] as { count?: number } | undefined)?.count || 0);
  const pendingAccountRequests = Number(
    ((results[7].results || [])[0] as { count?: number } | undefined)?.count || 0,
  );
  const recentFailedLogins = Number(((results[8].results || [])[0] as { count?: number } | undefined)?.count || 0);
  const feedbackTotal = Number(((results[9].results || [])[0] as { count?: number } | undefined)?.count || 0);

  function trendFor(type: string) {
    const current = currentPeriod[type] || 0;
    const prior = priorPeriod[type] || 0;
    const deltaPercent = prior > 0 ? Math.round(((current - prior) / prior) * 1000) / 10 : current > 0 ? 100 : 0;
    return { current, prior, deltaPercent };
  }

  const fileStorageLimitBytes = settings.maxTotalStorageMB * 1024 * 1024;
  const fileStorageBytes = Number(fileTotals.bytes || 0);
  const storagePercentUsed =
    fileStorageLimitBytes > 0 ? Math.round((fileStorageBytes / fileStorageLimitBytes) * 1000) / 10 : 0;

  return jsonResponse({
    ok: true,
    stats: {
      activeNotes: activeNotesCount,
      createdNotes: counts.note_created || 0,
      noteOpens: (counts.note_opened || 0) + (counts.shared_note_opened || 0),
      receivedOpens: counts.shared_note_opened || 0,
      feedbackTotal,
      feedbackNew: newFeedbackCount,
      uniqueNetworks: uniqueNetworksCount,
      pinFailures: counts.pin_failed || 0,
      activeFiles: Number(fileTotals.count || 0),
      fileDownloads: counts.file_downloaded || 0,
    },
    trends: {
      notesCreated: trendFor("note_created"),
      filesCreated: trendFor("file_created"),
      feedbackReceived: trendFor("feedback_submitted"),
    },
    needsAttention: {
      newFeedbackCount,
      pendingAccountRequests,
      storagePercentUsed,
      recentFailedLogins,
    },
    storage: {
      primary: "D1",
      filesBucketConfigured: Boolean(env.FILES_BUCKET),
      fileStorageBytes,
      fileStorageLimitBytes,
    },
  });
});

interface DropsQueryParams {
  type: "note" | "file" | null;
  q: string;
  filter: "locked" | "burn" | "expiring" | null;
  sort: "newest" | "oldest" | "expiring";
  page: number;
  pageSize: number;
}

function parseDropsQuery(query: Record<string, string | undefined>): DropsQueryParams {
  const type = query.type === "note" || query.type === "file" ? query.type : null;
  const q = typeof query.q === "string" ? query.q.trim().toLowerCase().slice(0, 100) : "";
  const filter =
    query.filter === "locked" || query.filter === "burn" || query.filter === "expiring" ? query.filter : null;
  const sort = query.sort === "oldest" || query.sort === "expiring" ? query.sort : "newest";
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(query.pageSize)) || 25));
  return { type, q, filter, sort, page, pageSize };
}

/** Builds one UNION ALL branch (notes or files) of the combined drops query,
 *  applying q/filter, but not sort/limit -- those apply to the combined set. */
function buildDropPart(kind: "note" | "file", now: number, opts: DropsQueryParams): { sql: string; binds: unknown[] } {
  const binds: unknown[] = [now];
  const conditions: string[] = [];
  const alias = kind === "note" ? "n" : "g";

  if (opts.q) {
    conditions.push(`(LOWER(${alias}.code) LIKE ? OR LOWER(${alias}.title) LIKE ?)`);
    binds.push(`%${opts.q}%`, `%${opts.q}%`);
  }
  if (opts.filter === "locked") {
    conditions.push(`${alias}.locked = 1`);
  } else if (opts.filter === "burn") {
    conditions.push(`${alias}.burn_after_read = 1`);
  } else if (opts.filter === "expiring") {
    conditions.push(`${alias}.expires_at <= ?`);
    binds.push(now + 3_600_000);
  }
  const extraWhere = conditions.length ? ` AND ${conditions.join(" AND ")}` : "";

  const sql =
    kind === "note"
      ? `SELECT 'note' AS type, n.id AS id, n.title AS title, n.locked AS locked, n.code AS code,
                n.created_at AS created_at, n.expires_at AS expires_at,
                substr(n.room_id, 1, 12) AS room_hash, n.user_id AS user_id,
                NULL AS total_size_bytes, NULL AS file_count, NULL AS download_count
         FROM notes n WHERE n.expires_at > ?${extraWhere}`
      : `SELECT 'file' AS type, g.id AS id, g.title AS title, g.locked AS locked, g.code AS code,
                g.created_at AS created_at, g.expires_at AS expires_at,
                substr(g.room_id, 1, 12) AS room_hash, g.user_id AS user_id,
                g.total_size_bytes AS total_size_bytes,
                (SELECT COUNT(*) FROM files WHERE files.group_id = g.id) AS file_count,
                (SELECT COALESCE(SUM(download_count), 0) FROM files WHERE files.group_id = g.id) AS download_count
         FROM file_groups g WHERE g.expires_at > ?${extraWhere}`;

  return { sql, binds };
}

function buildCombinedDropsSql(now: number, opts: DropsQueryParams): { combinedSql: string; binds: unknown[] } {
  const parts: { sql: string; binds: unknown[] }[] = [];
  if (opts.type === "note") {
    parts.push(buildDropPart("note", now, opts));
  } else if (opts.type === "file") {
    parts.push(buildDropPart("file", now, opts));
  } else {
    parts.push(buildDropPart("note", now, opts));
    parts.push(buildDropPart("file", now, opts));
  }
  const combinedSql = parts.map((part) => part.sql).join(" UNION ALL ");
  const binds = parts.flatMap((part) => part.binds);
  return { combinedSql, binds };
}

interface DropRow {
  type: "note" | "file";
  id: string;
  title: string;
  locked: number;
  code: string;
  created_at: number;
  expires_at: number;
  room_hash: string;
  user_id: string | null;
  total_size_bytes: number | null;
  file_count: number | null;
  download_count: number | null;
  owner_display_name: string | null;
  owner_role_name: string | null;
  owner_rank: number | null;
}

adminRoutes.get("/api/admin/drops", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env);
  if (authError) return authError;

  const now = Date.now();
  const opts = parseDropsQuery(c.req.query());
  const { combinedSql, binds } = buildCombinedDropsSql(now, opts);

  const totalRow = await env.DB.prepare(`WITH combined AS (${combinedSql}) SELECT COUNT(*) AS count FROM combined`)
    .bind(...binds)
    .first<{ count: number }>();
  const total = Number(totalRow?.count || 0);

  const sortExpr =
    opts.sort === "oldest" ? "c.created_at ASC" : opts.sort === "expiring" ? "c.expires_at ASC" : "c.created_at DESC";
  const listSql = `WITH combined AS (${combinedSql})
    SELECT c.*, u.display_name AS owner_display_name, r.name AS owner_role_name, r.rank AS owner_rank
    FROM combined c
    LEFT JOIN users u ON u.id = c.user_id
    LEFT JOIN roles r ON r.id = u.role_id
    ORDER BY ${sortExpr}
    LIMIT ? OFFSET ?`;
  const listBinds = [...binds, opts.pageSize, (opts.page - 1) * opts.pageSize];
  const result = await env.DB.prepare(listSql).bind(...listBinds).all<DropRow>();

  const items = (result.results || []).map((row) => ({
    type: row.type,
    id: String(row.id),
    title: String(row.title || "Untitled"),
    locked: Boolean(row.locked),
    code: String(row.code || ""),
    createdAt: Number(row.created_at || 0),
    expiresAt: Number(row.expires_at || 0),
    roomHash: String(row.room_hash || ""),
    totalSizeBytes: row.total_size_bytes === null ? null : Number(row.total_size_bytes),
    fileCount: row.file_count === null ? null : Number(row.file_count),
    downloadCount: row.download_count === null ? null : Number(row.download_count),
    ownerDisplayName: row.owner_display_name || null,
    ownerRoleName: row.owner_role_name || null,
    ownerRank: row.owner_rank === null || row.owner_rank === undefined ? null : Number(row.owner_rank),
  }));

  return jsonResponse({ ok: true, items, total, page: opts.page, pageSize: opts.pageSize });
});

adminRoutes.get("/api/admin/feedback", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env);
  if (authError) return authError;

  const query = c.req.query();
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(query.pageSize)) || 25));
  const allowedStatuses = new Set(["new", "reviewed", "resolved"]);
  const allowedCategories = new Set(["bug", "suggestion", "design", "other", "account_request"]);
  const status = typeof query.status === "string" && allowedStatuses.has(query.status) ? query.status : null;
  const category = typeof query.category === "string" && allowedCategories.has(query.category) ? query.category : null;

  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (status) {
    conditions.push("status = ?");
    binds.push(status);
  }
  if (category) {
    conditions.push("category = ?");
    binds.push(category);
  }
  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM feedback ${whereSql}`)
    .bind(...binds)
    .first<{ count: number }>();
  const total = Number(totalRow?.count || 0);

  const result = await env.DB.prepare(
    `SELECT * FROM feedback ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all<{
      id: string;
      category: string;
      message: string;
      email: string;
      rating: number;
      status: string;
      created_at: number;
      updated_at: number;
    }>();

  const items = (result.results || []).map((row) => ({
    id: String(row.id),
    category: String(row.category || "other"),
    message: String(row.message || ""),
    email: String(row.email || ""),
    rating: Number(row.rating || 0),
    status: String(row.status || "new"),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  }));

  return jsonResponse({ ok: true, items, total, page, pageSize });
});

adminRoutes.get("/api/admin/audit", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env);
  if (authError) return authError;

  const query = c.req.query();
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(query.pageSize)) || 25));
  const actor = typeof query.actor === "string" && query.actor.trim() ? query.actor.trim() : null;
  const action = typeof query.action === "string" && query.action.trim() ? query.action.trim().slice(0, 40) : null;

  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (actor) {
    conditions.push("(actor_user_id = ? OR actor_email = ?)");
    binds.push(actor, actor);
  }
  if (action) {
    conditions.push("action = ?");
    binds.push(action);
  }
  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM audit_log ${whereSql}`)
    .bind(...binds)
    .first<{ count: number }>();
  const total = Number(totalRow?.count || 0);

  const result = await env.DB.prepare(
    `SELECT * FROM audit_log ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all<{
      id: string;
      actor_user_id: string | null;
      actor_email: string | null;
      action: string;
      target_type: string | null;
      target_id: string | null;
      before_json: string | null;
      after_json: string | null;
      ip_hash: string | null;
      created_at: number;
    }>();

  const items = (result.results || []).map((row) => ({
    id: String(row.id),
    actorUserId: row.actor_user_id || null,
    actorEmail: row.actor_email || null,
    action: String(row.action || ""),
    targetType: row.target_type || null,
    targetId: row.target_id || null,
    before: row.before_json ? JSON.parse(row.before_json) : null,
    after: row.after_json ? JSON.parse(row.after_json) : null,
    ipHash: row.ip_hash || null,
    createdAt: Number(row.created_at || 0),
  }));

  return jsonResponse({ ok: true, items, total, page, pageSize });
});

interface BulkDeleteItem {
  type: "note" | "file";
  id: string;
}

adminRoutes.post("/api/admin/drops/bulk-delete", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;

  const body = await readJsonBody<{ items?: unknown }>(c.req.raw, 20_000);
  if (!body.ok) return body.response;
  const rawItems = Array.isArray(body.data.items) ? body.data.items : [];
  const items: BulkDeleteItem[] = rawItems.filter(
    (entry): entry is BulkDeleteItem =>
      Boolean(entry) &&
      typeof entry === "object" &&
      ((entry as { type?: unknown }).type === "note" || (entry as { type?: unknown }).type === "file") &&
      typeof (entry as { id?: unknown }).id === "string" &&
      (entry as { id: string }).id.length > 0,
  );
  if (!items.length) return jsonError("No items provided.", 400, "NO_ITEMS");

  let deleted = 0;
  let failed = 0;
  for (const entry of items) {
    try {
      if (entry.type === "note") {
        const note = await getNoteById(env, entry.id);
        if (!note) {
          failed += 1;
          continue;
        }
        await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(note.id).run();
        await recordEvent(env, c.req.raw, "note_deleted", { by: "admin" });
      } else {
        const group = await getGroupById(env, entry.id);
        if (!group) {
          failed += 1;
          continue;
        }
        await deleteGroupAndFiles(env, group.id);
        await recordEvent(env, c.req.raw, "file_deleted", { by: "admin" });
      }
      deleted += 1;
    } catch {
      failed += 1;
    }
  }

  const session = await getSession(c.req.raw, env);
  await recordAudit(env, {
    actorUserId: session?.sub ?? null,
    action: "drops_bulk_deleted",
    after: { requested: items.length, deleted, failed },
    ipHash: await getClientIpHash(c.req.raw, env.APP_SECRET),
  });

  return jsonResponse({ ok: true, deleted, failed });
});

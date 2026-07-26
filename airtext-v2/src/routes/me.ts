import { Hono } from "hono";
import type { Env } from "../types";
import { CONFIG } from "../lib/config";
import { jsonResponse, jsonError, readJsonBody } from "../lib/http";
import { hashPassword, constantTimeEqual } from "../lib/crypto";
import { getClientIpHash, getAuthenticatedUser, createSessionToken, buildSessionCookie } from "../middleware/auth";
import { enforceCooldown } from "../middleware/rateLimit";
import { recordEvent } from "../lib/analytics";
import { deleteGroupAndFiles } from "./files";

/**
 * Phase 6: general login for ANY account (admin/Contributor/Pro), separate
 * from /api/admin/login which stays rank-0-only. This is what backs the
 * "My shares" dashboard -- Contributor/Pro accounts have no admin-panel
 * access, just a view of their own shares.
 */

export const meRoutes = new Hono<{ Bindings: Env }>();

interface UserAuthRow {
  id: string;
  password_salt: string;
  password_hash: string;
  status: string;
  rank: number;
}

meRoutes.get("/api/auth/session", async (c) => {
  const env = c.env;
  const user = await getAuthenticatedUser(c.req.raw, env);
  return jsonResponse({
    ok: true,
    authenticated: user !== null,
    user: user ? { displayName: user.displayName, email: user.email, roleName: user.roleName, rank: user.rank } : null,
  });
});

meRoutes.post("/api/auth/login", async (c) => {
  const env = c.env;
  const body = await readJsonBody<{ email?: string; password?: string }>(c.req.raw, 2_000);
  if (!body.ok) return body.response;
  const email = typeof body.data.email === "string" ? body.data.email.trim().toLowerCase() : "";
  const password = typeof body.data.password === "string" ? body.data.password : "";
  if (!email || !password) return jsonError("Email and password are required.", 400, "MISSING_CREDENTIALS");

  const clientHash = await getClientIpHash(c.req.raw, env.APP_SECRET);
  const cooldown = await enforceCooldown(env, `auth-login:${clientHash}`, 3);
  if (!cooldown.allowed) {
    return jsonError(`Please wait ${cooldown.retryAfter} seconds and try again.`, 429, "LOGIN_RATE_LIMIT");
  }

  const row = await env.DB.prepare(
    `SELECT u.id, u.password_salt, u.password_hash, u.status, r.rank
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.email = ?`,
  )
    .bind(email)
    .first<UserAuthRow>();

  if (!row || row.status !== "active") {
    await recordEvent(env, c.req.raw, "user_login_failed");
    return jsonError("Incorrect email or password.", 401, "INVALID_CREDENTIALS");
  }
  const suppliedHash = await hashPassword(env.APP_SECRET, row.password_salt, password);
  if (!constantTimeEqual(suppliedHash, row.password_hash)) {
    await recordEvent(env, c.req.raw, "user_login_failed");
    return jsonError("Incorrect email or password.", 401, "INVALID_CREDENTIALS");
  }

  const token = await createSessionToken(env.APP_SECRET, row.id, row.rank);
  await env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
  await recordEvent(env, c.req.raw, "user_login");
  return jsonResponse(
    { ok: true, message: "Signed in." },
    200,
    { "set-cookie": buildSessionCookie(token, CONFIG.ADMIN_SESSION_SECONDS) },
  );
});

meRoutes.post("/api/auth/logout", () => {
  return jsonResponse({ ok: true, message: "Signed out." }, 200, { "set-cookie": buildSessionCookie("", 0) });
});

meRoutes.get("/api/me/shares", async (c) => {
  const env = c.env;
  const user = await getAuthenticatedUser(c.req.raw, env);
  if (!user) return jsonError("Sign in to view your shares.", 401, "AUTH_REQUIRED");

  const now = Date.now();
  const [notesResult, groupsResult] = await Promise.all([
    env.DB.prepare(
      "SELECT id, title, locked, code, created_at, expires_at FROM notes WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC",
    )
      .bind(user.id, now)
      .all<{ id: string; title: string; locked: number; code: string; created_at: number; expires_at: number }>(),
    env.DB.prepare(
      `SELECT g.id, g.title, g.locked, g.code, g.total_size_bytes, g.created_at, g.expires_at,
              (SELECT COUNT(*) FROM files WHERE files.group_id = g.id) AS file_count
       FROM file_groups g WHERE g.user_id = ? AND g.expires_at > ? ORDER BY g.created_at DESC`,
    )
      .bind(user.id, now)
      .all<{
        id: string; title: string; locked: number; code: string; total_size_bytes: number;
        created_at: number; expires_at: number; file_count: number;
      }>(),
  ]);

  return jsonResponse({
    ok: true,
    notes: (notesResult.results || []).map((row) => ({
      id: row.id,
      title: row.title,
      locked: Boolean(row.locked),
      code: row.code,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    })),
    files: (groupsResult.results || []).map((row) => ({
      id: row.id,
      title: row.title,
      locked: Boolean(row.locked),
      code: row.code,
      totalSizeBytes: row.total_size_bytes,
      fileCount: row.file_count,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    })),
  });
});

meRoutes.delete("/api/me/shares/notes/:noteId", async (c) => {
  const env = c.env;
  const user = await getAuthenticatedUser(c.req.raw, env);
  if (!user) return jsonError("Sign in to manage your shares.", 401, "AUTH_REQUIRED");
  const result = await env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(c.req.param("noteId"), user.id).run();
  if (!result.meta || Number(result.meta.changes || 0) < 1) {
    return jsonError("Note not found.", 404, "NOT_FOUND");
  }
  await recordEvent(env, c.req.raw, "note_deleted", { by: "owner" });
  return jsonResponse({ ok: true, message: "Note deleted." });
});

meRoutes.delete("/api/me/shares/files/:groupId", async (c) => {
  const env = c.env;
  const user = await getAuthenticatedUser(c.req.raw, env);
  if (!user) return jsonError("Sign in to manage your shares.", 401, "AUTH_REQUIRED");
  const group = await env.DB.prepare("SELECT id FROM file_groups WHERE id = ? AND user_id = ?")
    .bind(c.req.param("groupId"), user.id)
    .first<{ id: string }>();
  if (!group) return jsonError("File not found.", 404, "NOT_FOUND");
  await deleteGroupAndFiles(env, group.id);
  await recordEvent(env, c.req.raw, "file_deleted", { by: "owner" });
  return jsonResponse({ ok: true, message: "File deleted." });
});


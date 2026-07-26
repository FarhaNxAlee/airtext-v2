import { Hono } from "hono";
import type { Env } from "../types";
import { jsonResponse, jsonError, readJsonBody } from "../lib/http";
import { hashPassword, randomBase64Url } from "../lib/crypto";
import { requireAdmin } from "../middleware/auth";
import { recordEvent } from "../lib/analytics";

/** Phase 4: admin-only user + role management. All routes here require
 *  rank 0 (see requireAdmin) -- Contributor/Pro accounts have no self-
 *  service UI yet (that's the Phase 6 "My shares" dashboard's job, and
 *  it doesn't need account *management*, just a logged-in view). */

export const usersRoutes = new Hono<{ Bindings: Env }>();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  status: string;
  created_at: number;
  last_login_at: number | null;
  role_id: number;
  role_name: string;
  rank: number;
  custom_limits: string | null;
}

function publicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    roleId: row.role_id,
    roleName: row.role_name,
    rank: row.rank,
    customLimits: row.custom_limits ? JSON.parse(row.custom_limits) : null,
  };
}

usersRoutes.get("/api/admin/users", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env);
  if (authError) return authError;
  const result = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.status, u.created_at, u.last_login_at,
            u.role_id, r.name AS role_name, r.rank, u.custom_limits
     FROM users u JOIN roles r ON r.id = u.role_id
     ORDER BY r.rank ASC, u.created_at ASC`,
  ).all<UserRow>();
  return jsonResponse({ ok: true, users: (result.results || []).map(publicUser) });
});

usersRoutes.post("/api/admin/users", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;

  const body = await readJsonBody<{
    email?: string;
    password?: string;
    displayName?: string;
    roleId?: number;
    customLimits?: unknown;
  }>(c.req.raw, 4_000);
  if (!body.ok) return body.response;

  const email = typeof body.data.email === "string" ? body.data.email.trim().toLowerCase() : "";
  const password = typeof body.data.password === "string" ? body.data.password : "";
  const displayName = typeof body.data.displayName === "string" ? body.data.displayName.trim().slice(0, 80) : "";
  const roleId = Number(body.data.roleId);

  if (!email || !EMAIL_PATTERN.test(email)) return jsonError("Enter a valid email address.", 400, "INVALID_EMAIL");
  if (password.length < 10) return jsonError("Password must be at least 10 characters.", 400, "WEAK_PASSWORD");
  if (!displayName) return jsonError("Display name is required.", 400, "DISPLAY_NAME_REQUIRED");
  if (!Number.isFinite(roleId)) return jsonError("A role is required.", 400, "ROLE_REQUIRED");

  const role = await env.DB.prepare("SELECT id FROM roles WHERE id = ?").bind(roleId).first();
  if (!role) return jsonError("Unknown role.", 400, "UNKNOWN_ROLE");

  const existing = await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
  if (existing) return jsonError("An account with this email already exists.", 409, "EMAIL_TAKEN");

  let customLimitsJson: string | null = null;
  if (body.data.customLimits && typeof body.data.customLimits === "object") {
    customLimitsJson = JSON.stringify(body.data.customLimits);
  }

  const id = randomBase64Url(16);
  const salt = randomBase64Url(18);
  const passwordHash = await hashPassword(env.APP_SECRET, salt, password);

  await env.DB.prepare(
    `INSERT INTO users (id, email, password_salt, password_hash, display_name, role_id, custom_limits, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  )
    .bind(id, email, salt, passwordHash, displayName, roleId, customLimitsJson, Date.now())
    .run();

  await recordEvent(env, c.req.raw, "admin_user_created");
  return jsonResponse({ ok: true, message: "Account created.", user: { id, email, displayName, roleId } }, 201);
});

usersRoutes.patch("/api/admin/users/:userId", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;
  const userId = c.req.param("userId");

  const body = await readJsonBody<{
    displayName?: string;
    roleId?: number;
    status?: string;
    customLimits?: unknown;
    password?: string;
  }>(c.req.raw, 4_000);
  if (!body.ok) return body.response;

  const current = await env.DB.prepare(
    `SELECT u.id, r.rank FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
  )
    .bind(userId)
    .first<{ id: string; rank: number }>();
  if (!current) return jsonError("Account not found.", 404, "NOT_FOUND");

  const updates: string[] = [];
  const values: unknown[] = [];

  if (typeof body.data.displayName === "string" && body.data.displayName.trim()) {
    updates.push("display_name = ?");
    values.push(body.data.displayName.trim().slice(0, 80));
  }
  if (body.data.roleId !== undefined) {
    const roleId = Number(body.data.roleId);
    const role = await env.DB.prepare("SELECT id FROM roles WHERE id = ?").bind(roleId).first();
    if (!role) return jsonError("Unknown role.", 400, "UNKNOWN_ROLE");
    updates.push("role_id = ?");
    values.push(roleId);
  }
  if (body.data.status !== undefined) {
    if (body.data.status !== "active" && body.data.status !== "disabled") {
      return jsonError("Invalid status.", 400, "INVALID_STATUS");
    }
    if (body.data.status === "disabled" && current.rank === 0) {
      const otherActiveAdmins = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM users u JOIN roles r ON r.id = u.role_id
         WHERE r.rank = 0 AND u.status = 'active' AND u.id != ?`,
      )
        .bind(userId)
        .first<{ count: number }>();
      if (!otherActiveAdmins || otherActiveAdmins.count < 1) {
        return jsonError("Cannot disable the only active admin account.", 400, "LAST_ADMIN");
      }
    }
    updates.push("status = ?");
    values.push(body.data.status);
  }
  if (body.data.customLimits !== undefined) {
    updates.push("custom_limits = ?");
    values.push(
      body.data.customLimits && typeof body.data.customLimits === "object" ? JSON.stringify(body.data.customLimits) : null,
    );
  }
  if (typeof body.data.password === "string" && body.data.password) {
    if (body.data.password.length < 10) return jsonError("Password must be at least 10 characters.", 400, "WEAK_PASSWORD");
    const salt = randomBase64Url(18);
    const passwordHash = await hashPassword(env.APP_SECRET, salt, body.data.password);
    updates.push("password_salt = ?", "password_hash = ?");
    values.push(salt, passwordHash);
  }

  if (!updates.length) return jsonError("No changes provided.", 400, "NO_CHANGES");

  await env.DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values, userId)
    .run();

  await recordEvent(env, c.req.raw, "admin_user_updated");
  return jsonResponse({ ok: true, message: "Account updated." });
});

usersRoutes.delete("/api/admin/users/:userId", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;
  const userId = c.req.param("userId");

  const current = await env.DB.prepare(
    `SELECT u.id, r.rank FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
  )
    .bind(userId)
    .first<{ id: string; rank: number }>();
  if (!current) return jsonError("Account not found.", 404, "NOT_FOUND");

  if (current.rank === 0) {
    const otherAdmins = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM users u JOIN roles r ON r.id = u.role_id WHERE r.rank = 0 AND u.id != ?`,
    )
      .bind(userId)
      .first<{ count: number }>();
    if (!otherAdmins || otherAdmins.count < 1) {
      return jsonError("Cannot delete the only admin account.", 400, "LAST_ADMIN");
    }
  }

  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  await recordEvent(env, c.req.raw, "admin_user_deleted");
  return jsonResponse({ ok: true, message: "Account deleted." });
});

interface RoleRow {
  id: number;
  rank: number;
  name: string;
  is_system: number;
  default_limits: string;
}

usersRoutes.get("/api/admin/roles", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env);
  if (authError) return authError;
  const result = await env.DB.prepare("SELECT id, rank, name, is_system, default_limits FROM roles ORDER BY rank ASC").all<RoleRow>();
  return jsonResponse({
    ok: true,
    roles: (result.results || []).map((row) => ({
      id: row.id,
      rank: row.rank,
      name: row.name,
      isSystem: Boolean(row.is_system),
      defaultLimits: row.rank === 0 ? null : JSON.parse(row.default_limits || "{}"),
    })),
  });
});

usersRoutes.patch("/api/admin/roles/:roleId", async (c) => {
  const env = c.env;
  const authError = await requireAdmin(c.req.raw, env, true);
  if (authError) return authError;
  const roleId = Number(c.req.param("roleId"));

  const body = await readJsonBody<{ name?: string; defaultLimits?: unknown }>(c.req.raw, 4_000);
  if (!body.ok) return body.response;

  const role = await env.DB.prepare("SELECT id, rank FROM roles WHERE id = ?").bind(roleId).first<{ id: number; rank: number }>();
  if (!role) return jsonError("Unknown role.", 404, "NOT_FOUND");

  const updates: string[] = [];
  const values: unknown[] = [];

  if (typeof body.data.name === "string" && body.data.name.trim()) {
    updates.push("name = ?");
    values.push(body.data.name.trim().slice(0, 40));
  }
  if (body.data.defaultLimits !== undefined) {
    if (role.rank === 0) {
      return jsonError("The admin role's limits are fixed and not configurable.", 400, "ADMIN_LIMITS_FIXED");
    }
    if (!body.data.defaultLimits || typeof body.data.defaultLimits !== "object") {
      return jsonError("defaultLimits must be an object.", 400, "INVALID_LIMITS");
    }
    updates.push("default_limits = ?");
    values.push(JSON.stringify(body.data.defaultLimits));
  }

  if (!updates.length) return jsonError("No changes provided.", 400, "NO_CHANGES");

  await env.DB.prepare(`UPDATE roles SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values, roleId)
    .run();

  await recordEvent(env, c.req.raw, "admin_role_updated");
  return jsonResponse({ ok: true, message: "Role updated." });
});

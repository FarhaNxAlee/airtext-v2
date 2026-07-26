import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { hashPassword, randomBase64Url } from "../src/lib/crypto";

const ADMIN_EMAIL = "users-test-admin@test.local";
const ADMIN_PASSWORD = "users-test-admin-password";

beforeAll(async () => {
  const adminRole = await env.DB.prepare("SELECT id FROM roles WHERE rank = 0").first<{ id: number }>();
  const salt = randomBase64Url(16);
  const passwordHash = await hashPassword(env.APP_SECRET, salt, ADMIN_PASSWORD);
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_salt, password_hash, display_name, role_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
  )
    .bind("users-test-admin-id", ADMIN_EMAIL, salt, passwordHash, "Users Test Admin", adminRole!.id, Date.now())
    .run();
});

beforeEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 3100)); // admin login rate limit
});

async function login() {
  const response = await SELF.fetch("https://example.com/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  return cookie;
}

describe("POST /api/admin/users", () => {
  it("creates a Pro user with a correctly hashed password", async () => {
    const cookie = await login();
    const proRole = await env.DB.prepare("SELECT id FROM roles WHERE rank = 2").first<{ id: number }>();

    const createResponse = await SELF.fetch("https://example.com/api/admin/users", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "x-airtext-admin": "1" },
      body: JSON.stringify({
        email: "new-pro@test.local",
        password: "a-strong-password-1",
        displayName: "New Pro User",
        roleId: proRole!.id,
      }),
    });
    expect(createResponse.status).toBe(201);

    const row = await env.DB.prepare("SELECT password_salt, password_hash, role_id FROM users WHERE email = ?")
      .bind("new-pro@test.local")
      .first<{ password_salt: string; password_hash: string; role_id: number }>();
    expect(row!.role_id).toBe(proRole!.id);
    const expectedHash = await hashPassword(env.APP_SECRET, row!.password_salt, "a-strong-password-1");
    expect(row!.password_hash).toBe(expectedHash);

    // /api/admin/login is admin-only (rank 0) by design in this phase --
    // general login for Contributor/Pro accounts lands with the Phase 6
    // "My shares" dashboard, which is the first thing that needs it.
    await new Promise((resolve) => setTimeout(resolve, 3100));
    const proLoginAttempt = await SELF.fetch("https://example.com/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "new-pro@test.local", password: "a-strong-password-1" }),
    });
    expect(proLoginAttempt.status).toBe(401);
  });

  it("rejects a duplicate email", async () => {
    const cookie = await login();
    const proRole = await env.DB.prepare("SELECT id FROM roles WHERE rank = 2").first<{ id: number }>();
    const response = await SELF.fetch("https://example.com/api/admin/users", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "x-airtext-admin": "1" },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: "a-strong-password-1",
        displayName: "Duplicate",
        roleId: proRole!.id,
      }),
    });
    expect(response.status).toBe(409);
  });

  it("rejects a weak password", async () => {
    const cookie = await login();
    const proRole = await env.DB.prepare("SELECT id FROM roles WHERE rank = 2").first<{ id: number }>();
    const response = await SELF.fetch("https://example.com/api/admin/users", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "x-airtext-admin": "1" },
      body: JSON.stringify({ email: "weak@test.local", password: "short", displayName: "Weak", roleId: proRole!.id }),
    });
    expect(response.status).toBe(400);
  });
});

describe("PATCH/DELETE /api/admin/users/:id", () => {
  it("prevents disabling or deleting the only admin account", async () => {
    const cookie = await login();
    const disableResponse = await SELF.fetch("https://example.com/api/admin/users/users-test-admin-id", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json", "x-airtext-admin": "1" },
      body: JSON.stringify({ status: "disabled" }),
    });
    expect(disableResponse.status).toBe(400);

    const deleteResponse = await SELF.fetch("https://example.com/api/admin/users/users-test-admin-id", {
      method: "DELETE",
      headers: { cookie, "x-airtext-admin": "1" },
    });
    expect(deleteResponse.status).toBe(400);
  });

  it("updates custom limits for a user", async () => {
    const cookie = await login();
    const proRole = await env.DB.prepare("SELECT id FROM roles WHERE rank = 2").first<{ id: number }>();
    const createResponse = await SELF.fetch("https://example.com/api/admin/users", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "x-airtext-admin": "1" },
      body: JSON.stringify({
        email: "custom-limits@test.local",
        password: "a-strong-password-1",
        displayName: "Custom Limits User",
        roleId: proRole!.id,
      }),
    });
    const created = (await createResponse.json()) as { user: { id: string } };

    const patchResponse = await SELF.fetch(`https://example.com/api/admin/users/${created.user.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json", "x-airtext-admin": "1" },
      body: JSON.stringify({ customLimits: { maxFileSizeMB: 999 } }),
    });
    expect(patchResponse.status).toBe(200);

    const row = await env.DB.prepare("SELECT custom_limits FROM users WHERE id = ?").bind(created.user.id).first<{ custom_limits: string }>();
    expect(JSON.parse(row!.custom_limits).maxFileSizeMB).toBe(999);
  });
});

describe("PATCH /api/admin/roles/:id", () => {
  it("renames a role and edits its default limits", async () => {
    const cookie = await login();
    const proRole = await env.DB.prepare("SELECT id FROM roles WHERE rank = 2").first<{ id: number }>();
    const response = await SELF.fetch(`https://example.com/api/admin/roles/${proRole!.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json", "x-airtext-admin": "1" },
      body: JSON.stringify({ name: "VIP", defaultLimits: { ttlSeconds: 43200, maxFileSizeMB: 8 } }),
    });
    expect(response.status).toBe(200);

    const row = await env.DB.prepare("SELECT name, default_limits FROM roles WHERE id = ?").bind(proRole!.id).first<{ name: string; default_limits: string }>();
    expect(row!.name).toBe("VIP");
    expect(JSON.parse(row!.default_limits).maxFileSizeMB).toBe(8);
  });

  it("rejects editing the admin role's limits", async () => {
    const cookie = await login();
    const adminRole = await env.DB.prepare("SELECT id FROM roles WHERE rank = 0").first<{ id: number }>();
    const response = await SELF.fetch(`https://example.com/api/admin/roles/${adminRole!.id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json", "x-airtext-admin": "1" },
      body: JSON.stringify({ defaultLimits: { maxFileSizeMB: 1 } }),
    });
    expect(response.status).toBe(400);
  });
});

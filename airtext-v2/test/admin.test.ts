import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { hashPassword, randomBase64Url } from "../src/lib/crypto";

const TEST_ADMIN_EMAIL = "admin@test.local";
const TEST_ADMIN_PASSWORD = "test-admin-password";

beforeAll(async () => {
  const adminRole = await env.DB.prepare("SELECT id FROM roles WHERE rank = 0").first<{ id: number }>();
  const salt = randomBase64Url(16);
  const passwordHash = await hashPassword(env.APP_SECRET, salt, TEST_ADMIN_PASSWORD);
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_salt, password_hash, display_name, role_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
  )
    .bind("test-admin-id", TEST_ADMIN_EMAIL, salt, passwordHash, "Test Admin", adminRole!.id, Date.now())
    .run();
});

async function login(email = TEST_ADMIN_EMAIL, password = TEST_ADMIN_PASSWORD) {
  const response = await SELF.fetch("https://example.com/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  return { response, cookie };
}

// admin login is rate-limited to 1 attempt / 3s per client -- give each test
// a moment so they don't trip on each other's cooldown window.
beforeEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 3100));
});

describe("POST /api/admin/login", () => {
  it("rejects an incorrect password", async () => {
    const { response } = await login(TEST_ADMIN_EMAIL, "wrong-password");
    expect(response.status).toBe(401);
  });

  it("rejects an unknown email", async () => {
    const { response } = await login("nobody@test.local", TEST_ADMIN_PASSWORD);
    expect(response.status).toBe(401);
  });

  it("signs in with the correct email/password and sets a session cookie", async () => {
    const { response, cookie } = await login();
    expect(response.status).toBe(200);
    expect(cookie).toMatch(/^__Host-airtext_session=/);
  });
});

describe("GET /api/admin/dashboard", () => {
  it("requires authentication", async () => {
    const response = await SELF.fetch("https://example.com/api/admin/dashboard");
    expect(response.status).toBe(401);
  });

  it("returns settings and stats once authenticated", async () => {
    const { cookie } = await login();
    const response = await SELF.fetch("https://example.com/api/admin/dashboard", {
      headers: { cookie: cookie! },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { settings: Record<string, unknown>; stats: Record<string, number> };
    expect(body.settings.appName).toBe("AirText");
    expect(typeof body.stats.activeNotes).toBe("number");
  });
});

describe("PATCH /api/admin/settings", () => {
  it("requires the admin mutation header even with a valid session", async () => {
    const { cookie } = await login();
    const response = await SELF.fetch("https://example.com/api/admin/settings", {
      method: "PATCH",
      headers: { cookie: cookie!, "content-type": "application/json" },
      body: JSON.stringify({ appName: "New Name" }),
    });
    expect(response.status).toBe(403);
  });

  it("persists a settings change and round-trips it through getSiteSettings", async () => {
    const { cookie } = await login();
    const patchResponse = await SELF.fetch("https://example.com/api/admin/settings", {
      method: "PATCH",
      headers: { cookie: cookie!, "content-type": "application/json", "x-airtext-admin": "1" },
      body: JSON.stringify({ appName: "Renamed App", maxTitleLength: 999 }),
    });
    expect(patchResponse.status).toBe(200);
    const patchBody = (await patchResponse.json()) as { settings: { appName: string; maxTitleLength: number } };
    expect(patchBody.settings.appName).toBe("Renamed App");
    // out-of-range numeric settings are clamped, not rejected
    expect(patchBody.settings.maxTitleLength).toBe(120);

    const row = await env.DB.prepare("SELECT data FROM site_settings WHERE id = 1").first<{ data: string }>();
    expect(JSON.parse(row!.data).appName).toBe("Renamed App");
  });
});

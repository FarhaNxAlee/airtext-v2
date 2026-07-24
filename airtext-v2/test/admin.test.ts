import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

async function login(password = "test-admin-password") {
  const response = await SELF.fetch("https://example.com/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
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
    const { response } = await login("wrong-password");
    expect(response.status).toBe(401);
  });

  it("signs in with the correct password and sets a session cookie", async () => {
    const { response, cookie } = await login();
    expect(response.status).toBe(200);
    expect(cookie).toMatch(/^__Host-airtext_admin=/);
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

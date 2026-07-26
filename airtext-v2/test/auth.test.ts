import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { hashPassword, randomBase64Url } from "../src/lib/crypto";

/** Verifies the Phase 3 auth unification: admin login now lives in the
 *  `users` table (see migrations/0001_accounts.sql), not an ADMIN_PASSWORD
 *  secret (removed from the Env entirely -- see src/types.ts) -- and
 *  there is no dual auth system left active. */

describe("auth unification", () => {
  it("has no ADMIN_PASSWORD-based login path left", async () => {
    // The old shape was {password} with no email; that request must now be
    // rejected as a bad request, not silently accepted via some legacy path.
    const response = await SELF.fetch("https://example.com/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "whatever-the-old-secret-used-to-be" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("MISSING_CREDENTIALS");
  });

  it("logs in an admin seeded directly into the users table, and rejects after role/status changes", async () => {
    const adminRole = await env.DB.prepare("SELECT id FROM roles WHERE rank = 0").first<{ id: number }>();
    const salt = randomBase64Url(16);
    const password = "unification-test-password";
    const passwordHash = await hashPassword(env.APP_SECRET, salt, password);
    const email = "unification-admin@test.local";

    await env.DB.prepare(
      `INSERT INTO users (id, email, password_salt, password_hash, display_name, role_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
      .bind("unification-admin-id", email, salt, passwordHash, "Unification Admin", adminRole!.id, Date.now())
      .run();

    const loginResponse = await SELF.fetch("https://example.com/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(loginResponse.status).toBe(200);
    const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0];

    const dashboardResponse = await SELF.fetch("https://example.com/api/admin/dashboard", {
      headers: { cookie: cookie! },
    });
    expect(dashboardResponse.status).toBe(200);

    // Disabling the account invalidates future logins immediately (existing
    // sessions aren't retroactively revoked -- that's a known limitation,
    // not covered by this pass).
    await env.DB.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").bind("unification-admin-id").run();
    await new Promise((resolve) => setTimeout(resolve, 3100)); // clear the login rate limit
    const disabledLoginResponse = await SELF.fetch("https://example.com/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(disabledLoginResponse.status).toBe(401);
  });
});

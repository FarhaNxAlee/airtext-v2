import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, randomBase64Url } from "../src/lib/crypto";

const TEST_ADMIN_EMAIL = "admin@test.local";
const TEST_ADMIN_PASSWORD = "test-admin-password";

beforeEach(async () => {
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

// Phase 8 (V3-PLAN.md section 7.8): the split-off, paginated/filterable
// replacements for /api/admin/dashboard (which stays untouched above).

async function insertTestNote(overrides: { title?: string; code?: string; expiresAt?: number; locked?: number } = {}) {
  const id = randomBase64Url(8);
  await env.DB.prepare(
    `INSERT INTO notes (id, room_id, title, body, locked, code, delete_token_hash, created_at, expires_at)
     VALUES (?, 'test-room-hash', ?, 'body text', ?, ?, 'delete-token-hash', ?, ?)`,
  )
    .bind(
      id,
      overrides.title || "Test note",
      overrides.locked ?? 0,
      overrides.code || randomBase64Url(6),
      Date.now(),
      overrides.expiresAt ?? Date.now() + 3_600_000,
    )
    .run();
  return id;
}

async function insertTestFileGroup(overrides: { title?: string; code?: string; expiresAt?: number } = {}) {
  const id = randomBase64Url(8);
  await env.DB.prepare(
    `INSERT INTO file_groups (id, room_id, title, locked, code, delete_token_hash, total_size_bytes, created_at, expires_at)
     VALUES (?, 'test-room-hash', ?, 0, ?, 'delete-token-hash', 1024, ?, ?)`,
  )
    .bind(
      id,
      overrides.title || "Test file",
      overrides.code || randomBase64Url(6),
      Date.now(),
      overrides.expiresAt ?? Date.now() + 3_600_000,
    )
    .run();
  return id;
}

describe("GET /api/admin/overview", () => {
  it("requires authentication", async () => {
    const response = await SELF.fetch("https://example.com/api/admin/overview");
    expect(response.status).toBe(401);
  });

  it("returns stats, trends and a needs-attention summary once authenticated", async () => {
    const { cookie } = await login();
    const response = await SELF.fetch("https://example.com/api/admin/overview", { headers: { cookie: cookie! } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      stats: Record<string, number>;
      trends: Record<string, { current: number; prior: number; deltaPercent: number }>;
      needsAttention: { newFeedbackCount: number; pendingAccountRequests: number; storagePercentUsed: number; recentFailedLogins: number };
    };
    expect(typeof body.stats.activeNotes).toBe("number");
    expect(typeof body.trends.notesCreated.current).toBe("number");
    expect(typeof body.needsAttention.pendingAccountRequests).toBe("number");
  });
});

describe("GET /api/admin/drops", () => {
  it("requires authentication", async () => {
    const response = await SELF.fetch("https://example.com/api/admin/drops");
    expect(response.status).toBe(401);
  });

  it("paginates a unified, type-filterable list of notes and files", async () => {
    await insertTestNote({ title: "Alpha note" });
    await insertTestNote({ title: "Beta note" });
    await insertTestNote({ title: "Gamma note" });
    await insertTestFileGroup({ title: "Delta file" });

    const { cookie } = await login();

    const page1 = await SELF.fetch("https://example.com/api/admin/drops?type=note&page=1&pageSize=2&sort=oldest", {
      headers: { cookie: cookie! },
    });
    expect(page1.status).toBe(200);
    const page1Body = (await page1.json()) as { items: { type: string }[]; total: number; page: number; pageSize: number };
    expect(page1Body.items.length).toBe(2);
    expect(page1Body.total).toBe(3);
    expect(page1Body.items.every((item) => item.type === "note")).toBe(true);

    const page2 = await SELF.fetch("https://example.com/api/admin/drops?type=note&page=2&pageSize=2&sort=oldest", {
      headers: { cookie: cookie! },
    });
    const page2Body = (await page2.json()) as { items: unknown[] };
    expect(page2Body.items.length).toBe(1);

    const combined = await SELF.fetch("https://example.com/api/admin/drops?pageSize=100", { headers: { cookie: cookie! } });
    const combinedBody = (await combined.json()) as { items: { type: string }[]; total: number };
    expect(combinedBody.total).toBe(4);
    expect(combinedBody.items.some((item) => item.type === "file")).toBe(true);
  });

  it("filters by search query", async () => {
    await insertTestNote({ title: "Findable Unique Title" });
    await insertTestNote({ title: "Something else entirely" });
    const { cookie } = await login();
    const response = await SELF.fetch("https://example.com/api/admin/drops?q=findable", { headers: { cookie: cookie! } });
    const body = (await response.json()) as { items: { title: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.items[0].title).toBe("Findable Unique Title");
  });
});

describe("GET /api/admin/feedback", () => {
  it("requires authentication", async () => {
    const response = await SELF.fetch("https://example.com/api/admin/feedback");
    expect(response.status).toBe(401);
  });

  it("paginates and filters by category", async () => {
    const id1 = randomBase64Url(8);
    const id2 = randomBase64Url(8);
    await env.DB.prepare(
      `INSERT INTO feedback (id, category, message, email, rating, status, created_at) VALUES (?, 'account_request', 'please make me an account', '', 0, 'new', ?)`,
    )
      .bind(id1, Date.now())
      .run();
    await env.DB.prepare(
      `INSERT INTO feedback (id, category, message, email, rating, status, created_at) VALUES (?, 'bug', 'something broke', '', 0, 'new', ?)`,
    )
      .bind(id2, Date.now())
      .run();

    const { cookie } = await login();
    const response = await SELF.fetch("https://example.com/api/admin/feedback?category=account_request&pageSize=10", {
      headers: { cookie: cookie! },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: { category: string }[]; total: number; page: number; pageSize: number };
    expect(body.total).toBe(1);
    expect(body.items[0].category).toBe("account_request");
  });
});

describe("GET /api/admin/audit", () => {
  it("requires authentication", async () => {
    const response = await SELF.fetch("https://example.com/api/admin/audit");
    expect(response.status).toBe(401);
  });

  it("records an entry when settings are changed", async () => {
    const { cookie } = await login();
    await SELF.fetch("https://example.com/api/admin/settings", {
      method: "PATCH",
      headers: { cookie: cookie!, "content-type": "application/json", "x-airtext-admin": "1" },
      body: JSON.stringify({ appName: "Audited App Name" }),
    });

    const response = await SELF.fetch("https://example.com/api/admin/audit?action=settings_updated", {
      headers: { cookie: cookie! },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: { action: string; after: Record<string, unknown> | null }[]; total: number };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.items[0].action).toBe("settings_updated");
  });
});

describe("POST /api/admin/drops/bulk-delete", () => {
  it("requires the admin mutation header even with a valid session", async () => {
    const noteId = await insertTestNote();
    const { cookie } = await login();
    const response = await SELF.fetch("https://example.com/api/admin/drops/bulk-delete", {
      method: "POST",
      headers: { cookie: cookie!, "content-type": "application/json" },
      body: JSON.stringify({ items: [{ type: "note", id: noteId }] }),
    });
    expect(response.status).toBe(403);
  });

  it("deletes the requested notes and files and reports counts", async () => {
    const noteId = await insertTestNote();
    const fileGroupId = await insertTestFileGroup();
    const { cookie } = await login();

    const response = await SELF.fetch("https://example.com/api/admin/drops/bulk-delete", {
      method: "POST",
      headers: { cookie: cookie!, "content-type": "application/json", "x-airtext-admin": "1" },
      body: JSON.stringify({
        items: [
          { type: "note", id: noteId },
          { type: "file", id: fileGroupId },
          { type: "note", id: "does-not-exist" },
        ],
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; deleted: number; failed: number };
    expect(body.deleted).toBe(2);
    expect(body.failed).toBe(1);

    const remainingNote = await env.DB.prepare("SELECT 1 FROM notes WHERE id = ?").bind(noteId).first();
    expect(remainingNote).toBeNull();
    const remainingGroup = await env.DB.prepare("SELECT 1 FROM file_groups WHERE id = ?").bind(fileGroupId).first();
    expect(remainingGroup).toBeNull();
  });
});

describe("PATCH /api/admin/item/:itemId", () => {
  it("requires the admin mutation header even with a valid session", async () => {
    const noteId = await insertTestNote();
    const { cookie } = await login();
    const response = await SELF.fetch(`https://example.com/api/admin/item/${noteId}`, {
      method: "PATCH",
      headers: { cookie: cookie!, "content-type": "application/json" },
      body: JSON.stringify({ title: "Admin edited" }),
    });
    expect(response.status).toBe(403);
  });

  it("edits any note by id, bypassing delete-token/ownership, and writes an audit log entry", async () => {
    const noteId = await insertTestNote({ title: "Before admin edit" });
    const { cookie } = await login();
    const response = await SELF.fetch(`https://example.com/api/admin/item/${noteId}`, {
      method: "PATCH",
      headers: { cookie: cookie!, "content-type": "application/json", "x-airtext-admin": "1" },
      body: JSON.stringify({ title: "After admin edit" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { item: { title: string } };
    expect(body.item.title).toBe("After admin edit");

    const auditResponse = await SELF.fetch("https://example.com/api/admin/audit?page=1&pageSize=5", { headers: { cookie: cookie! } });
    const auditBody = (await auditResponse.json()) as { items: { action: string; target_id?: string }[] };
    expect(auditBody.items.some((entry) => entry.action === "note_edited")).toBe(true);
  });
});

describe("PATCH /api/admin/file/:fileId", () => {
  it("requires the admin mutation header even with a valid session", async () => {
    const fileGroupId = await insertTestFileGroup();
    const { cookie } = await login();
    const form = new FormData();
    form.set("title", "Admin edited");
    form.append("file", new File(["admin added this"], "admin.txt", { type: "text/plain" }));
    const response = await SELF.fetch(`https://example.com/api/admin/file/${fileGroupId}`, {
      method: "PATCH",
      headers: { cookie: cookie! },
      body: form,
    });
    expect(response.status).toBe(403);
  });

  it("edits any file group by id, bypassing delete-token/ownership, and writes an audit log entry", async () => {
    const fileGroupId = await insertTestFileGroup({ title: "Before admin edit" });
    const { cookie } = await login();
    const form = new FormData();
    form.set("title", "After admin edit");
    form.append("file", new File(["admin added this"], "admin.txt", { type: "text/plain" }));
    const response = await SELF.fetch(`https://example.com/api/admin/file/${fileGroupId}`, {
      method: "PATCH",
      headers: { cookie: cookie!, "x-airtext-admin": "1" },
      body: form,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { group: { title: string; fileCount: number } };
    expect(body.group.title).toBe("After admin edit");
    expect(body.group.fileCount).toBe(1);

    const auditResponse = await SELF.fetch("https://example.com/api/admin/audit?page=1&pageSize=5", { headers: { cookie: cookie! } });
    const auditBody = (await auditResponse.json()) as { items: { action: string }[] };
    expect(auditBody.items.some((entry) => entry.action === "file_edited")).toBe(true);
  });
});

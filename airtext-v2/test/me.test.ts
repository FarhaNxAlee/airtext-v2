import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, randomBase64Url } from "../src/lib/crypto";

const PRO_EMAIL = "me-test-pro@test.local";
const PRO_PASSWORD = "me-test-pro-password";

beforeEach(async () => {
  const proRole = await env.DB.prepare("SELECT id FROM roles WHERE rank = 2").first<{ id: number }>();
  const salt = randomBase64Url(16);
  const passwordHash = await hashPassword(env.APP_SECRET, salt, PRO_PASSWORD);
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_salt, password_hash, display_name, role_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
  )
    .bind("me-test-pro-id", PRO_EMAIL, salt, passwordHash, "Me Test Pro", proRole!.id, Date.now())
    .run();
});


async function login() {
  const response = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: PRO_EMAIL, password: PRO_PASSWORD }),
  });
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  return cookie;
}

describe("POST /api/auth/login", () => {
  it("logs in a non-admin (Pro) account -- unlike /api/admin/login which is rank-0-only", async () => {
    const response = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: PRO_EMAIL, password: PRO_PASSWORD }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/^__Host-airtext_session=/);
  });
});

describe("GET /api/auth/session", () => {
  it("reports authenticated with role info once logged in", async () => {
    const cookie = await login();
    const response = await SELF.fetch("https://example.com/api/auth/session", { headers: { cookie } });
    const body = (await response.json()) as { authenticated: boolean; user: { roleName: string; rank: number } };
    expect(body.authenticated).toBe(true);
    expect(body.user.rank).toBe(2);
  });
});

describe("GET /api/me/shares", () => {
  it("lists only the logged-in user's own notes and files, and lets them delete by ownership", async () => {
    const cookie = await login();

    const noteResponse = await SELF.fetch("https://example.com/api/items", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "My share", text: "owned by pro user" }),
    });
    const note = (await noteResponse.json()) as { item: { id: string } };

    const sharesResponse = await SELF.fetch("https://example.com/api/me/shares", { headers: { cookie } });
    expect(sharesResponse.status).toBe(200);
    const shares = (await sharesResponse.json()) as { notes: { id: string }[] };
    expect(shares.notes.some((n) => n.id === note.item.id)).toBe(true);

    // Delete by session ownership -- no delete token needed.
    const deleteResponse = await SELF.fetch(`https://example.com/api/me/shares/notes/${note.item.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(deleteResponse.status).toBe(200);
  });

  it("requires authentication", async () => {
    const response = await SELF.fetch("https://example.com/api/me/shares");
    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/me/shares/notes/:noteId", () => {
  it("edits an owned note by session ownership, with no delete token needed", async () => {
    const cookie = await login();
    const noteResponse = await SELF.fetch("https://example.com/api/items", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Owner edit me", text: "before" }),
    });
    const note = (await noteResponse.json()) as { item: { id: string } };

    const editResponse = await SELF.fetch(`https://example.com/api/me/shares/notes/${note.item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Owner edited", text: "after" }),
    });
    expect(editResponse.status).toBe(200);
    const body = (await editResponse.json()) as { item: { title: string; text: string } };
    expect(body.item.title).toBe("Owner edited");
    expect(body.item.text).toBe("after");
  });

  it("rejects editing a note that isn't owned by the caller", async () => {
    const cookie = await login();
    const noteResponse = await SELF.fetch("https://example.com/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Not yours", text: "hi" }),
    });
    const note = (await noteResponse.json()) as { item: { id: string } };

    const editResponse = await SELF.fetch(`https://example.com/api/me/shares/notes/${note.item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Should not work" }),
    });
    expect(editResponse.status).toBe(404);
  });
});

describe("GET /api/me/shares/notes/:noteId", () => {
  it("returns full detail for prefilling the edit modal", async () => {
    const cookie = await login();
    const noteResponse = await SELF.fetch("https://example.com/api/items", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Prefill me", text: "full text body" }),
    });
    const note = (await noteResponse.json()) as { item: { id: string } };

    const getResponse = await SELF.fetch(`https://example.com/api/me/shares/notes/${note.item.id}`, { headers: { cookie } });
    expect(getResponse.status).toBe(200);
    const body = (await getResponse.json()) as { item: { title: string; text: string } };
    expect(body.item.title).toBe("Prefill me");
    expect(body.item.text).toBe("full text body");
  });
});

describe("POST /api/me/shares/notes/:noteId/share-to-network", () => {
  it("publishes an owned note onto the current network's board", async () => {
    const cookie = await login();
    const noteResponse = await SELF.fetch("https://example.com/api/items", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Share me elsewhere", text: "hi" }),
    });
    const note = (await noteResponse.json()) as { item: { id: string } };

    const shareResponse = await SELF.fetch(`https://example.com/api/me/shares/notes/${note.item.id}/share-to-network`, {
      method: "POST",
      headers: { cookie },
    });
    expect(shareResponse.status).toBe(200);
    const body = (await shareResponse.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("rejects sharing a burn-after-read note to a network", async () => {
    const cookie = await login();
    const noteResponse = await SELF.fetch("https://example.com/api/items", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Burns once", text: "hi", burnAfterRead: true }),
    });
    const note = (await noteResponse.json()) as { item: { id: string } };

    const shareResponse = await SELF.fetch(`https://example.com/api/me/shares/notes/${note.item.id}/share-to-network`, {
      method: "POST",
      headers: { cookie },
    });
    expect(shareResponse.status).toBe(409);
  });

  it("rejects sharing a note that isn't owned by the caller", async () => {
    const cookie = await login();
    const noteResponse = await SELF.fetch("https://example.com/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Not yours", text: "hi" }),
    });
    const note = (await noteResponse.json()) as { item: { id: string } };

    const shareResponse = await SELF.fetch(`https://example.com/api/me/shares/notes/${note.item.id}/share-to-network`, {
      method: "POST",
      headers: { cookie },
    });
    expect(shareResponse.status).toBe(404);
  });

  it("re-sharing after the visibility window elapsed refreshes added_at instead of no-op'ing", async () => {
    const cookie = await login();
    const noteResponse = await SELF.fetch("https://example.com/api/items", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Re-share me", text: "hi" }),
    });
    const note = (await noteResponse.json()) as { item: { id: string } };

    // Simulate the visibility window (default 6h) having elapsed for this room.
    const staleAddedAt = Date.now() - 7 * 60 * 60 * 1000;
    await env.DB.prepare("UPDATE network_notes SET added_at = ? WHERE note_id = ?").bind(staleAddedAt, note.item.id).run();

    const beforeList = await SELF.fetch("https://example.com/api/local/items");
    const beforeBody = (await beforeList.json()) as { items: { id: string }[] };
    expect(beforeBody.items.some((item) => item.id === note.item.id)).toBe(false);

    const shareResponse = await SELF.fetch(`https://example.com/api/me/shares/notes/${note.item.id}/share-to-network`, {
      method: "POST",
      headers: { cookie },
    });
    expect(shareResponse.status).toBe(200);

    const afterList = await SELF.fetch("https://example.com/api/local/items");
    const afterBody = (await afterList.json()) as { items: { id: string }[] };
    expect(afterBody.items.some((item) => item.id === note.item.id)).toBe(true);
  });
});

describe("PATCH /api/me/password", () => {
  const PW_EMAIL = "me-test-pwchange@test.local";
  const PW_PASSWORD = "me-test-pwchange-password";

  beforeEach(async () => {
    const proRole = await env.DB.prepare("SELECT id FROM roles WHERE rank = 2").first<{ id: number }>();
    const salt = randomBase64Url(16);
    const passwordHash = await hashPassword(env.APP_SECRET, salt, PW_PASSWORD);
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_salt, password_hash, display_name, role_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
      .bind("me-test-pwchange-id", PW_EMAIL, salt, passwordHash, "Me Test PwChange", proRole!.id, Date.now())
      .run();
  });

  async function loginPwChangeUser(password: string) {
    const response = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: PW_EMAIL, password }),
    });
    return response;
  }

  it("rejects an incorrect current password", async () => {
    const loginResponse = await loginPwChangeUser(PW_PASSWORD);
    const cookie = loginResponse.headers.get("set-cookie")!.split(";")[0];
    const response = await SELF.fetch("https://example.com/api/me/password", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ currentPassword: "wrong-password", newPassword: "brand-new-password" }),
    });
    expect(response.status).toBe(401);
  });

  it("updates the password hash, so the old password stops working and the new one logs in", async () => {
    await new Promise((resolve) => setTimeout(resolve, 3100)); // clear login rate limit
    const loginResponse = await loginPwChangeUser(PW_PASSWORD);
    const cookie = loginResponse.headers.get("set-cookie")!.split(";")[0];

    const changeResponse = await SELF.fetch("https://example.com/api/me/password", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ currentPassword: PW_PASSWORD, newPassword: "brand-new-password" }),
    });
    expect(changeResponse.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 3100)); // clear login rate limit
    const oldLoginResponse = await loginPwChangeUser(PW_PASSWORD);
    expect(oldLoginResponse.status).toBe(401);

    await new Promise((resolve) => setTimeout(resolve, 3100)); // clear login rate limit
    const newLoginResponse = await loginPwChangeUser("brand-new-password");
    expect(newLoginResponse.status).toBe(200);
  }, 15_000);
});

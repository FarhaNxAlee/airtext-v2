import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { hashPassword, randomBase64Url } from "../src/lib/crypto";

async function createNote(overrides: Record<string, unknown> = {}, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  const response = await SELF.fetch("https://example.com/api/items", {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "Test note", text: "Hello world", ...overrides }),
  });
  const body = (await response.json()) as { ok: boolean; item: { id: string; code: string }; deleteToken: string };
  return { response, body };
}

const VANITY_TEST_EMAIL = "notes-test-pro@test.local";
const VANITY_TEST_PASSWORD = "notes-test-pro-password";

beforeAll(async () => {
  const proRole = await env.DB.prepare("SELECT id FROM roles WHERE rank = 2").first<{ id: number }>();
  const salt = randomBase64Url(16);
  const passwordHash = await hashPassword(env.APP_SECRET, salt, VANITY_TEST_PASSWORD);
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_salt, password_hash, display_name, role_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
  )
    .bind("notes-test-pro-id", VANITY_TEST_EMAIL, salt, passwordHash, "Vanity Tester", proRole!.id, Date.now())
    .run();
});

async function loginAsPro() {
  await new Promise((resolve) => setTimeout(resolve, 3100)); // login rate limit
  const response = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: VANITY_TEST_EMAIL, password: VANITY_TEST_PASSWORD }),
  });
  return response.headers.get("set-cookie")!.split(";")[0];
}

describe("POST /api/items", () => {
  it("creates a note and returns a share code and delete token", async () => {
    const { response, body } = await createNote();
    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.item.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(body.deleteToken).toBeTruthy();
  });

  it("rejects a missing title", async () => {
    const response = await SELF.fetch("https://example.com/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "", text: "Hello world" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("TITLE_REQUIRED");
  });

  it("rejects a PIN that's too short when locking is requested", async () => {
    const response = await SELF.fetch("https://example.com/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Locked", text: "secret", locked: true, pin: "12" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("INVALID_PIN_LENGTH");
  });
});

describe("GET /api/share/:code", () => {
  it("returns the note text for an unlocked note", async () => {
    const { body: created } = await createNote({ title: "Shared", text: "Visible text" });
    const response = await SELF.fetch(`https://example.com/api/share/${created.item.code}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { item: { text: string } };
    expect(body.item.text).toBe("Visible text");
  });

  it("returns 404 for an unknown code", async () => {
    const response = await SELF.fetch("https://example.com/api/share/ZZZZZZ");
    expect(response.status).toBe(404);
  });

  it("does not include text for a locked note until the correct PIN is supplied", async () => {
    const { body: created } = await createNote({ title: "Locked", text: "secret text", locked: true, pin: "1234" });
    const getResponse = await SELF.fetch(`https://example.com/api/share/${created.item.code}`);
    const getBody = (await getResponse.json()) as { item: { text?: string } };
    expect(getBody.item.text).toBeUndefined();

    const wrongPin = await SELF.fetch(`https://example.com/api/share/${created.item.code}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "0000" }),
    });
    expect(wrongPin.status).toBe(401);

    // unlockCooldownSeconds defaults to 2s and is keyed per-item, so back-to-back
    // unlock attempts against the same note trip the rate limit.
    await new Promise((resolve) => setTimeout(resolve, 2100));

    const rightPin = await SELF.fetch(`https://example.com/api/share/${created.item.code}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });
    expect(rightPin.status).toBe(200);
    const unlockedBody = (await rightPin.json()) as { item: { text: string } };
    expect(unlockedBody.item.text).toBe("secret text");
  });
});

describe("DELETE /api/item/:itemId", () => {
  it("deletes a note when the correct delete token is supplied", async () => {
    const { body: created } = await createNote();
    const badToken = await SELF.fetch(`https://example.com/api/item/${created.item.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deleteToken: "wrong-token" }),
    });
    expect(badToken.status).toBe(403);

    const goodToken = await SELF.fetch(`https://example.com/api/item/${created.item.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deleteToken: created.deleteToken }),
    });
    expect(goodToken.status).toBe(200);

    const afterDelete = await SELF.fetch(`https://example.com/api/share/${created.item.code}`);
    expect(afterDelete.status).toBe(404);
  });
});

describe("burn-after-read", () => {
  it("deletes the note after its first shared open, but anonymous requests can't set custom codes", async () => {
    const { body: created } = await createNote({ burnAfterRead: true, customCode: "PICKME1" });
    // customCode is silently ignored for anonymous (allowCustomCode: false) --
    // a random code is generated instead, not the requested vanity one.
    expect(created.item.code).not.toBe("PICKME1");

    const firstOpen = await SELF.fetch(`https://example.com/api/share/${created.item.code}`);
    expect(firstOpen.status).toBe(200);
    const firstBody = (await firstOpen.json()) as { item: { text: string } };
    expect(firstBody.item.text).toBe("Hello world");

    const secondOpen = await SELF.fetch(`https://example.com/api/share/${created.item.code}`);
    expect(secondOpen.status).toBe(404);
  });

  it("does not burn the creator's own local-board view", async () => {
    const { body: created } = await createNote({ burnAfterRead: true });
    const localOpen = await SELF.fetch(`https://example.com/api/local/item/${created.item.id}`);
    expect(localOpen.status).toBe(200);
    const stillThere = await SELF.fetch(`https://example.com/api/local/item/${created.item.id}`);
    expect(stillThere.status).toBe(200);
  });
});

describe("vanity share codes", () => {
  it("lets a Pro user (allowCustomCode) pick their own code", async () => {
    const cookie = await loginAsPro();
    const { response, body } = await createNote({ customCode: "myvanity1" }, cookie);
    expect(response.status).toBe(201);
    expect(body.item.code).toBe("MYVANITY1");
  });

  it("rejects a code that's already taken", async () => {
    const cookie = await loginAsPro();
    await createNote({ customCode: "taken123" }, cookie);
    await new Promise((resolve) => setTimeout(resolve, 4100)); // clear the create-note cooldown
    const { response } = await createNote({ customCode: "taken123" }, cookie);
    expect(response.status).toBe(409);
  }, 10_000);
});

describe("expiry chooser (ttlSeconds override)", () => {
  it("honors a ttlSeconds override smaller than the effective limit", async () => {
    const { response, body } = await createNote({ ttlSeconds: 600 });
    expect(response.status).toBe(201);
    const actualTtl = Math.round((body.item.expiresAt - body.item.createdAt) / 1000);
    expect(actualTtl).toBe(600);
  });

  it("clamps a ttlSeconds override above the effective limit down to the limit", async () => {
    const { response, body } = await createNote({ ttlSeconds: 999_999_999 });
    expect(response.status).toBe(201);
    const actualTtl = Math.round((body.item.expiresAt - body.item.createdAt) / 1000);
    // Anonymous default ttlSeconds is 3600s (settings.ttlSeconds) -- the
    // requested override must never exceed the caller's effective limit.
    expect(actualTtl).toBeLessThanOrEqual(3600);
  });

  it("falls back to the default effective ttl when ttlSeconds is omitted", async () => {
    const { response, body } = await createNote();
    expect(response.status).toBe(201);
    const actualTtl = Math.round((body.item.expiresAt - body.item.createdAt) / 1000);
    expect(actualTtl).toBe(3600);
  });
});

describe("GET /api/local/count", () => {
  it("returns a numeric count that increases after creating a note", async () => {
    const before = await SELF.fetch("https://example.com/api/local/count");
    expect(before.status).toBe(200);
    const beforeBody = (await before.json()) as { ok: boolean; count: number };
    expect(beforeBody.ok).toBe(true);
    expect(typeof beforeBody.count).toBe("number");

    await createNote({ title: "Count me" });
    const after = await SELF.fetch("https://example.com/api/local/count");
    const afterBody = (await after.json()) as { count: number };
    expect(afterBody.count).toBeGreaterThanOrEqual(beforeBody.count + 1);
  });
});

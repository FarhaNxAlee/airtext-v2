import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

async function createNote(overrides: Record<string, unknown> = {}) {
  const response = await SELF.fetch("https://example.com/api/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Test note", text: "Hello world", ...overrides }),
  });
  const body = (await response.json()) as { ok: boolean; item: { id: string; code: string }; deleteToken: string };
  return { response, body };
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

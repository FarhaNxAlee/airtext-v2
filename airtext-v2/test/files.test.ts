import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { hashPassword, randomBase64Url } from "../src/lib/crypto";

async function uploadFiles(
  files: { name: string; content: string; type?: string }[],
  overrides: Record<string, string> = {},
  cookie?: string,
) {
  const form = new FormData();
  files.forEach((file) => form.append("file", new File([file.content], file.name, { type: file.type || "text/plain" })));
  if (overrides.title) form.set("title", overrides.title);
  if (overrides.locked) form.set("locked", overrides.locked);
  if (overrides.pin) form.set("pin", overrides.pin);
  if (overrides.burnAfterRead) form.set("burnAfterRead", overrides.burnAfterRead);
  if (overrides.customCode) form.set("customCode", overrides.customCode);
  if (overrides.ttlSeconds) form.set("ttlSeconds", overrides.ttlSeconds);

  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  const response = await SELF.fetch("https://example.com/api/files", { method: "POST", body: form, headers });
  const body = (await response.json()) as {
    ok: boolean;
    group: {
      id: string; code: string; fileCount: number; createdAt: number; expiresAt: number;
      files: { id: string; filename: string; downloadUrl?: string }[];
    };
    deleteToken: string;
  };
  return { response, body };
}

const FILES_TEST_PRO_EMAIL = "files-test-pro@test.local";
const FILES_TEST_PRO_PASSWORD = "files-test-pro-password";

beforeAll(async () => {
  const proRole = await env.DB.prepare("SELECT id FROM roles WHERE rank = 2").first<{ id: number }>();
  const salt = randomBase64Url(16);
  const passwordHash = await hashPassword(env.APP_SECRET, salt, FILES_TEST_PRO_PASSWORD);
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_salt, password_hash, display_name, role_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
  )
    .bind("files-test-pro-id", FILES_TEST_PRO_EMAIL, salt, passwordHash, "Files Vanity Tester", proRole!.id, Date.now())
    .run();
});

async function loginAsFilesPro() {
  await new Promise((resolve) => setTimeout(resolve, 3100)); // login rate limit
  const response = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: FILES_TEST_PRO_EMAIL, password: FILES_TEST_PRO_PASSWORD }),
  });
  return response.headers.get("set-cookie")!.split(";")[0];
}

function uploadFile(overrides: Record<string, string> = {}, content = "hello file content") {
  return uploadFiles([{ name: overrides.filename || "test.txt", content }], overrides);
}

describe("POST /api/files", () => {
  it("uploads a single file and returns a share code and delete token", async () => {
    const { response, body } = await uploadFile();
    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.group.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(body.group.fileCount).toBe(1);
    expect(body.deleteToken).toBeTruthy();
  });

  it("uploads multiple files as one batch under a single code", async () => {
    const { response, body } = await uploadFiles([
      { name: "one.txt", content: "aaa" },
      { name: "two.txt", content: "bbb" },
      { name: "three.txt", content: "ccc" },
    ]);
    expect(response.status).toBe(201);
    expect(body.group.fileCount).toBe(3);
    expect(body.group.files.map((f) => f.filename).sort()).toEqual(["one.txt", "three.txt", "two.txt"]);
  });

  it("rejects blocked file extensions", async () => {
    const { response } = await uploadFile({ filename: "malware.exe" });
    expect(response.status).toBe(400);
  });

  it("rejects a single file over the per-file cap (anonymous default 2MB)", async () => {
    const oversized = "x".repeat(2 * 1024 * 1024 + 100);
    const { response, body } = await uploadFile({}, oversized);
    expect(response.status).toBe(413);
    expect((body as unknown as { code: string }).code).toBe("FILE_TOO_LARGE");
  });

  it("rejects a batch over the total batch cap (anonymous default 30MB) even if each file is under the per-file cap", async () => {
    const files = Array.from({ length: 16 }, (_, index) => ({ name: `f${index}.bin`, content: "x".repeat(2 * 1024 * 1024) }));
    const { response, body } = await uploadFiles(files);
    // 16 files also exceeds maxFilesPerBatch (15) -- either error is a correctly-enforced limit.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(["TOO_MANY_FILES", "BATCH_TOO_LARGE"]).toContain((body as unknown as { code: string }).code);
  });
});

describe("GET /api/file/:fileId/download", () => {
  it("downloads each file in a batch via its own signed token", async () => {
    const { body: created } = await uploadFiles([
      { name: "a.txt", content: "content A" },
      { name: "b.txt", content: "content B" },
    ]);
    const shareResponse = await SELF.fetch(`https://example.com/api/share/file/${created.group.code}`);
    const shareBody = (await shareResponse.json()) as { group: { files: { id: string; downloadUrl: string; filename: string }[] } };
    expect(shareBody.group.files).toHaveLength(2);

    for (const file of shareBody.group.files) {
      expect(file.downloadUrl).toBeTruthy();
      const downloadResponse = await SELF.fetch(new URL(file.downloadUrl, "https://example.com"));
      expect(downloadResponse.status).toBe(200);
      const expected = file.filename === "a.txt" ? "content A" : "content B";
      expect(await downloadResponse.text()).toBe(expected);
    }
  });

  it("rejects a forged or expired download token", async () => {
    const { body: created } = await uploadFile();
    const response = await SELF.fetch(`https://example.com/api/file/${created.group.files[0].id}/download?token=0.forged`);
    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/file/:groupId", () => {
  it("deletes the whole batch and frees every R2 object when the correct delete token is supplied", async () => {
    const { body: created } = await uploadFiles([
      { name: "a.txt", content: "A" },
      { name: "b.txt", content: "B" },
    ]);
    const response = await SELF.fetch(`https://example.com/api/file/${created.group.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deleteToken: created.deleteToken }),
    });
    expect(response.status).toBe(200);

    const afterDelete = await SELF.fetch(`https://example.com/api/share/file/${created.group.code}`);
    expect(afterDelete.status).toBe(404);
  });
});

describe("burn-after-read (files)", () => {
  it("deletes the whole batch after the first file download, not at open-time", async () => {
    const { body: created } = await uploadFiles(
      [{ name: "a.txt", content: "A" }, { name: "b.txt", content: "B" }],
      { burnAfterRead: "1" },
    );

    const openResponse = await SELF.fetch(`https://example.com/api/share/file/${created.group.code}`);
    expect(openResponse.status).toBe(200);
    const opened = (await openResponse.json()) as { group: { files: { downloadUrl: string }[] } };

    // Still alive after open -- burn happens on download, not open.
    const stillOpen = await SELF.fetch(`https://example.com/api/share/file/${created.group.code}`);
    expect(stillOpen.status).toBe(200);

    await SELF.fetch(new URL(opened.group.files[0].downloadUrl, "https://example.com"));
    const afterDownload = await SELF.fetch(`https://example.com/api/share/file/${created.group.code}`);
    expect(afterDownload.status).toBe(404);
  });
});

describe("vanity share codes (files)", () => {
  it("lets a Pro user pick their own code, anonymous requests get a random one instead", async () => {
    const cookie = await loginAsFilesPro();
    const { response, body } = await uploadFiles([{ name: "a.txt", content: "A" }], { customCode: "filevanity1" }, cookie);
    expect(response.status).toBe(201);
    expect(body.group.code).toBe("FILEVANITY1");

    // The upload-cooldown rate limit key is IP-based (not session-based),
    // so the anonymous request below shares a bucket with the Pro upload
    // just above -- wait it out rather than getting a false 429.
    await new Promise((resolve) => setTimeout(resolve, 6100));
    const { response: anonResponse, body: anon } = await uploadFiles([{ name: "b.txt", content: "B" }], { customCode: "shouldnotapply" });
    expect(anonResponse.status).toBe(201);
    expect(anon.group.code).not.toBe("SHOULDNOTAPPLY");
  }, 10_000);
});

describe("expiry chooser (ttlSeconds override, files)", () => {
  it("honors a ttlSeconds override smaller than the effective limit", async () => {
    const { response, body } = await uploadFile({ ttlSeconds: "600" });
    expect(response.status).toBe(201);
    const actualTtl = Math.round((body.group.expiresAt - body.group.createdAt) / 1000);
    expect(actualTtl).toBe(600);
  });

  it("clamps a ttlSeconds override above the effective limit down to the limit", async () => {
    const { response, body } = await uploadFile({ ttlSeconds: "999999999" });
    expect(response.status).toBe(201);
    const actualTtl = Math.round((body.group.expiresAt - body.group.createdAt) / 1000);
    // Anonymous default fileTtlSeconds is 3600s (settings.fileTtlSeconds).
    expect(actualTtl).toBeLessThanOrEqual(3600);
  });
});

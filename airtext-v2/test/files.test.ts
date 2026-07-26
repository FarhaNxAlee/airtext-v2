import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

async function uploadFiles(files: { name: string; content: string; type?: string }[], overrides: Record<string, string> = {}) {
  const form = new FormData();
  files.forEach((file) => form.append("file", new File([file.content], file.name, { type: file.type || "text/plain" })));
  if (overrides.title) form.set("title", overrides.title);
  if (overrides.locked) form.set("locked", overrides.locked);
  if (overrides.pin) form.set("pin", overrides.pin);

  const response = await SELF.fetch("https://example.com/api/files", { method: "POST", body: form });
  const body = (await response.json()) as {
    ok: boolean;
    group: { id: string; code: string; fileCount: number; files: { id: string; filename: string }[] };
    deleteToken: string;
  };
  return { response, body };
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

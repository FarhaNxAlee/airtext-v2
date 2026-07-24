import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

async function uploadFile(overrides: Record<string, string> = {}, content = "hello file content") {
  const form = new FormData();
  form.set("file", new File([content], overrides.filename || "test.txt", { type: "text/plain" }));
  if (overrides.title) form.set("title", overrides.title);
  if (overrides.locked) form.set("locked", overrides.locked);
  if (overrides.pin) form.set("pin", overrides.pin);

  const response = await SELF.fetch("https://example.com/api/files", { method: "POST", body: form });
  const body = (await response.json()) as {
    ok: boolean;
    file: { id: string; code: string };
    deleteToken: string;
  };
  return { response, body };
}

describe("POST /api/files", () => {
  it("uploads a file and returns a share code and delete token", async () => {
    const { response, body } = await uploadFile();
    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.file.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(body.deleteToken).toBeTruthy();
  });

  it("rejects blocked file extensions", async () => {
    const { response } = await uploadFile({ filename: "malware.exe" });
    expect(response.status).toBe(400);
  });
});

describe("GET /api/file/:fileId/download", () => {
  it("downloads the uploaded file via a signed token", async () => {
    const { body: created } = await uploadFile({}, "download me");
    const shareResponse = await SELF.fetch(`https://example.com/api/share/file/${created.file.code}`);
    const shareBody = (await shareResponse.json()) as { file: { downloadUrl: string } };
    expect(shareBody.file.downloadUrl).toBeTruthy();

    const downloadResponse = await SELF.fetch(new URL(shareBody.file.downloadUrl, "https://example.com"));
    expect(downloadResponse.status).toBe(200);
    expect(await downloadResponse.text()).toBe("download me");
  });

  it("rejects a forged or expired download token", async () => {
    const { body: created } = await uploadFile();
    const response = await SELF.fetch(`https://example.com/api/file/${created.file.id}/download?token=0.forged`);
    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/file/:fileId", () => {
  it("deletes the file and frees the R2 object when the correct delete token is supplied", async () => {
    const { body: created } = await uploadFile();
    const response = await SELF.fetch(`https://example.com/api/file/${created.file.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deleteToken: created.deleteToken }),
    });
    expect(response.status).toBe(200);

    const afterDelete = await SELF.fetch(`https://example.com/api/share/file/${created.file.code}`);
    expect(afterDelete.status).toBe(404);
  });
});

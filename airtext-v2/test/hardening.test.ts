import { SELF, env } from "cloudflare:test";
import { describe, it, expect, vi } from "vitest";
import { createSessionToken } from "../src/middleware/auth";
import { recordAudit } from "../src/lib/audit";
import { deleteObjectsReliably } from "../src/lib/r2";
import { enforceCooldown } from "../src/middleware/rateLimit";
import { readJsonBody } from "../src/lib/http";

async function adminCookie() {
  const role = await env.DB.prepare("SELECT id FROM roles WHERE rank=0").first<{id:number}>();
  await env.DB.prepare("INSERT INTO users (id,email,password_salt,password_hash,display_name,role_id,status,created_at) VALUES ('hardening-admin','hardening@example.test','unused','unused','Audit',?,'active',?)").bind(role!.id, Date.now()).run();
  return `__Host-airtext_session=${await createSessionToken(env.APP_SECRET, "hardening-admin", 0)}`;
}

describe("security guarantees", () => {
  it.each(["disabled", "demoted", "deleted", "password-reset"])("revokes existing admin cookies when %s", async (change) => {
    const cookie = await adminCookie();
    if (change === "disabled") await env.DB.prepare("UPDATE users SET status='disabled' WHERE id='hardening-admin'").run();
    if (change === "demoted") await env.DB.prepare("UPDATE users SET role_id=(SELECT id FROM roles WHERE rank=2) WHERE id='hardening-admin'").run();
    if (change === "deleted") await env.DB.prepare("DELETE FROM users WHERE id='hardening-admin'").run();
    if (change === "password-reset") await env.DB.prepare("UPDATE users SET session_version=session_version+1 WHERE id='hardening-admin'").run();
    expect((await SELF.fetch("https://example.com/api/admin/users", { headers: { cookie } })).status).toBe(401);
    const session = await SELF.fetch("https://example.com/api/admin/session", { headers: { cookie } });
    expect((await session.json() as {authenticated:boolean}).authenticated).toBe(false);
  });

  it("only one simultaneous recipient can consume an Open once note", async () => {
    const create = await SELF.fetch("https://example.com/api/items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({title:"Once",text:"secret",burnAfterRead:true}) });
    const created = await create.json() as {item:{id:string;code:string}};
    const nearby = await SELF.fetch("https://example.com/api/local/items");
    expect(JSON.stringify(await nearby.json())).not.toContain(created.item.id);
    const opens = await Promise.all([1,2,3].map(() => SELF.fetch(`https://example.com/api/share/${created.item.code}`)));
    expect(opens.map((r) => r.status).sort()).toEqual([200,404,404]);
  });

  it("never copies drop text or credentials into audit snapshots", async () => {
    await recordAudit(env, { action:"note_edited",targetType:"note",before:{text:"private-before",locked:false},after:{text:"private-after",pin:"1234",nested:{password:"secret"},locked:true} });
    const rows = await env.DB.prepare("SELECT before_json,after_json FROM audit_log").all();
    const serialized = JSON.stringify(rows.results);
    expect(serialized).not.toContain("private-");
    expect(serialized).not.toContain("1234");
    expect(serialized).not.toContain("secret");
    expect(serialized).toContain("locked");
  });

  it("keeps an R2 deletion retry key through storage failure", async () => {
    await env.FILES_BUCKET.put("retry-fixture", "bytes");
    const failure = vi.spyOn(env.FILES_BUCKET, "delete").mockRejectedValueOnce(new Error("temporary outage"));
    await deleteObjectsReliably(env, ["retry-fixture"]);
    failure.mockRestore();
    expect(await env.DB.prepare("SELECT r2_key FROM object_deletions WHERE r2_key='retry-fixture'").first()).toBeTruthy();
    await deleteObjectsReliably(env, ["retry-fixture"]);
    expect(await env.FILES_BUCKET.get("retry-fixture")).toBe(null);
    expect(await env.DB.prepare("SELECT r2_key FROM object_deletions WHERE r2_key='retry-fixture'").first()).toBe(null);
  });

  it("grants only one concurrent cooldown claim", async () => {
    const claims = await Promise.all([1,2,3].map(() => enforceCooldown(env, "race", 5)));
    expect(claims.filter((claim) => claim.allowed)).toHaveLength(1);
  });

  it("bounds chunked JSON bodies without trusting Content-Length", async () => {
    const request = new Request("https://example.com", { method:"POST", body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode("x".repeat(100)));c.close();}}) });
    const result = await readJsonBody(request, 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });
});

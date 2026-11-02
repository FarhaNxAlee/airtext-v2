import { SELF, env } from "cloudflare:test";
import { it, expect } from "vitest";
import { encryptText, decryptItem, storeKey } from "../client/encryption.js";
import { createSessionToken } from "../src/middleware/auth";

it("round trips Unicode with independent keys, fresh IVs, and authenticated ciphertext", async () => {
  const text = "A private note — مرحبا 👋";
  const first = await encryptText(text);
  const second = await encryptText(text, first.key);
  expect(first.encryptionIv).not.toBe(second.encryptionIv);
  expect(first.text).not.toBe(second.text);
  storeKey("ENCODE", first.key);
  expect((await decryptItem({...first,code:"ENCODE"})).text).toBe(text);
  storeKey("ENCODE", (await encryptText("other")).key);
  await expect(decryptItem({...first,code:"ENCODE"})).rejects.toThrow("incorrect");
});

it("stores only ciphertext, hides encrypted notes from Nearby, and does not consume before key readiness", async () => {
  const role = await env.DB.prepare("SELECT id FROM roles WHERE rank=0").first();
  await env.DB.prepare("INSERT INTO users (id,email,password_salt,password_hash,display_name,role_id,status,created_at) VALUES ('encryption-admin','encryption@example.test','unused','unused','Encrypt',?,'active',?)").bind(role.id,Date.now()).run();
  const cookie = `__Host-airtext_session=${await createSessionToken(env.APP_SECRET,"encryption-admin",0)}`;
  const envelope = await encryptText("plaintext-must-never-reach-storage");
  const {key, ...payload} = envelope;
  const response = await SELF.fetch("https://example.com/api/items", {method:"POST",headers:{cookie,"content-type":"application/json"},body:JSON.stringify({...payload,title:"Encrypted fixture",burnAfterRead:true})});
  expect(response.status).toBe(201);
  const created=await response.json();
  const row=await env.DB.prepare("SELECT body,body_encrypted,encryption_iv FROM notes WHERE id=?").bind(created.item.id).first();
  expect(row.body).toBe(envelope.text);
  expect(row.body).not.toContain("plaintext");
  expect(row.body_encrypted).toBe(1);
  expect(await env.DB.prepare("SELECT note_id FROM network_notes WHERE note_id=?").bind(created.item.id).first()).toBe(null);
  const metadata=await SELF.fetch(`https://example.com/api/share/${created.item.code}`);
  expect((await metadata.json()).item.text).toBeUndefined();
  storeKey(created.item.code,key);
  const opened=await SELF.fetch(`https://example.com/api/share/${created.item.code}`,{headers:{"x-airtext-decrypt-ready":"1"}});
  const item=(await opened.json()).item;
  expect((await decryptItem(item)).text).toBe("plaintext-must-never-reach-storage");
  expect((await SELF.fetch(`https://example.com/api/share/${created.item.code}`)).status).toBe(404);
});

it("rejects encryption for anonymous plans and rejects malformed envelopes", async () => {
  const response=await SELF.fetch("https://example.com/api/items",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:"Forbidden",text:"plaintext",encrypted:true,encryptionVersion:1,encryptionIv:"invalid"})});
  expect(response.status).toBe(403);
});

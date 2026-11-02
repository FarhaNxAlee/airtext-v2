import type { Env } from "../types";
import type { SiteSettings } from "./settings";
import { hmacHex, constantTimeEqual } from "./crypto";

/** Ported verbatim from airtext-worker-modern.js:1917-1960, 1939-1944. */

export function getFileExtension(filename: string): string {
  const clean = String(filename || "").trim().toLowerCase();
  const dot = clean.lastIndexOf(".");
  return dot >= 0 && dot < clean.length - 1 ? clean.slice(dot + 1) : "";
}

export function parseExtensionList(value: string): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
}

export function isExtensionAllowed(settings: SiteSettings, filename: string): boolean {
  const ext = getFileExtension(filename);
  const blocked = parseExtensionList(settings.blockedFileExtensions);
  if (ext && blocked.includes(ext)) return false;
  const allowed = parseExtensionList(settings.allowedFileExtensions);
  if (allowed.length && !allowed.includes(ext)) return false;
  return true;
}

export async function getTotalFileStorageBytes(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT COALESCE(SUM(total_size_bytes), 0) AS total FROM file_groups WHERE expires_at > ?")
    .bind(Date.now())
    .first<{ total: number }>();
  return Number(row?.total || 0);
}

export async function createFileDownloadToken(secret: string, fileId: string, expiresAt: number, owner = false): Promise<string> {
  const signature = await hmacHex(secret, `${owner ? "owner-download" : "file-download"}:${fileId}:${expiresAt}`);
  return `${expiresAt}.${signature}`;
}

export async function verifyFileDownloadToken(secret: string, fileId: string, token: string, owner = false): Promise<boolean> {
  const raw = String(token || "");
  const dot = raw.indexOf(".");
  if (dot <= 0) return false;
  const expiresAt = Number(raw.slice(0, dot));
  const signature = raw.slice(dot + 1);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = await hmacHex(secret, `${owner ? "owner-download" : "file-download"}:${fileId}:${expiresAt}`);
  return constantTimeEqual(signature, expected);
}

/** Persist intent before deleting; a transient R2 failure never loses its retry key. */
export async function deleteObjectsReliably(env: Env, rawKeys: string[]): Promise<void> {
  const keys = [...new Set(rawKeys)];
  if (!keys.length) return;
  await env.DB.prepare("INSERT OR IGNORE INTO object_deletions (r2_key, created_at) SELECT value, ? FROM json_each(?)").bind(Date.now(),JSON.stringify(keys)).run();
  if (!env.FILES_BUCKET) return;
  for (let offset=0; offset<keys.length; offset+=500) {
    const chunk=keys.slice(offset,offset+500);
    try {
      await env.FILES_BUCKET.delete(chunk);
      await env.DB.prepare("DELETE FROM object_deletions WHERE r2_key IN (SELECT value FROM json_each(?))").bind(JSON.stringify(chunk)).run();
    } catch (error) {
      console.warn("Object deletion queued for retry", { count: chunk.length, error: String(error) });
      await env.DB.prepare("UPDATE object_deletions SET attempts=attempts+1 WHERE r2_key IN (SELECT value FROM json_each(?))").bind(JSON.stringify(chunk)).run();
    }
  }
}

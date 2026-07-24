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
  const row = await env.DB.prepare("SELECT COALESCE(SUM(size_bytes), 0) AS total FROM files WHERE expires_at > ?")
    .bind(Date.now())
    .first<{ total: number }>();
  return Number(row?.total || 0);
}

export async function createFileDownloadToken(secret: string, fileId: string, expiresAt: number): Promise<string> {
  const signature = await hmacHex(secret, `file-download:${fileId}:${expiresAt}`);
  return `${expiresAt}.${signature}`;
}

export async function verifyFileDownloadToken(secret: string, fileId: string, token: string): Promise<boolean> {
  const raw = String(token || "");
  const dot = raw.indexOf(".");
  if (dot <= 0) return false;
  const expiresAt = Number(raw.slice(0, dot));
  const signature = raw.slice(dot + 1);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = await hmacHex(secret, `file-download:${fileId}:${expiresAt}`);
  return constantTimeEqual(signature, expected);
}

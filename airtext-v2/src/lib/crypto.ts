/**
 * Ported verbatim from airtext-worker-modern.js:1355-1401 — these are
 * security-sensitive (PIN hashing, delete tokens, admin session signing,
 * HMAC keys). Do not "improve" the algorithms, only the types.
 */

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(message)));
  return bytesToHex(new Uint8Array(signature));
}

export async function hashPin(secret: string, salt: string, pin: string): Promise<string> {
  return hmacHex(secret, `pin:${salt}:${pin}`);
}

export function bytesToHex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

export function constantTimeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = String(a || "");
  const right = String(b || "");
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(String(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value: string): string {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomShareCode(length: number): string {
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  for (const byte of bytes) code += SHARE_CODE_ALPHABET[byte % SHARE_CODE_ALPHABET.length];
  return code;
}

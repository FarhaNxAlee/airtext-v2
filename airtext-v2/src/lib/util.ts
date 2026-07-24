/**
 * Small stateless helpers ported verbatim from airtext-worker-modern.js
 * (normalizeTitle/Text/ShareCode/Path: :1403-1419, detectDevice/
 * normalizeAccessMethod: :1204-1213, getClientIp: :1304-1313,
 * isExpired: :1288-1290, formatServerDuration: :1281-1286,
 * parseCookies: :1257-1265).
 */

export function normalizeTitle(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeShareCode(value: unknown): string {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

export function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function formatServerDuration(seconds: number): string {
  const minutes = Math.round(Number(seconds) / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function detectDevice(userAgent: string | null): "tablet" | "mobile" | "desktop" {
  const ua = String(userAgent || "");
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

export function normalizeAccessMethod(value: unknown): "link" | "code" | "qr" | "network" {
  return ["link", "code", "qr", "network"].includes(value as string) ? (value as "link" | "code" | "qr" | "network") : "link";
}

export function getClientIp(request: Request): string {
  const cloudflareIp = request.headers.get("CF-Connecting-IP");
  if (cloudflareIp) return cloudflareIp.trim();
  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "preview-client";
}

export function isExpired(entity: { expiresAt: number }): boolean {
  return !entity.expiresAt || Number(entity.expiresAt) <= Date.now();
}

export function parseCookies(header: string | null): Record<string, string> {
  const output: Record<string, string> = Object.create(null);
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    output[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return output;
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

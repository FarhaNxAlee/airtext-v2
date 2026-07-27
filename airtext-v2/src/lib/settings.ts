import type { Env } from "../types";

/**
 * Ported verbatim from airtext-worker-modern.js:47-212. Every key here must
 * round-trip through sanitizeSettings() unchanged, and the admin settings
 * form (client-side) depends on this exact key set.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  // Tier 1 -- operational (limits, feature toggles, maintenance) --
  // see V3-PLAN.md section 2. Micro-copy that used to live here (headers,
  // drawer labels, hero panel, ticker, guide, feedback labels, footer
  // labels, files/QR-tool labels, section-visibility toggles) moved to
  // client/copy.js -- it's static UI text, not admin-editable config.
  ttlSeconds: 60 * 60,
  maxTitleLength: 80,
  maxTextLength: 10_000,
  maxLocalItems: 50,
  createCooldownSeconds: 4,
  unlockCooldownSeconds: 2,
  pinEnabled: true,
  notesEnabled: true,
  analyticsEnabled: true,
  crossNetworkAddEnabled: true,
  maintenanceMode: false,
  defaultTheme: "system",
  fileSharingEnabled: true,
  maxFileSizeMB: 2,
  maxTotalStorageMB: 500,
  maxBatchTotalMB: 30,
  maxFilesPerBatch: 15,
  fileTtlSeconds: 60 * 60,
  fileUploadCooldownSeconds: 6,
  maxActiveFiles: 200,
  allowedFileExtensions: "",
  blockedFileExtensions: "exe,bat,cmd,com,msi,scr,dll,jar,ps1,vbs,vbe,js,jse,wsf,apk",
  qrLinkToolEnabled: true,
  feedbackEnabled: true,
  announcementEnabled: true,
  announcement: "Move a note to another network with one secure link, short code or QR scan.",
  announcementLabel: "NEW",

  // Tier 2 -- brand & marketing copy, still admin-editable with a live
  // preview (V3-PLAN.md section 2).
  appName: "AirText",
  tagline: "Share text nearby or anywhere",
  heroTitlePrimary: "Share text.",
  heroTitleOutline: "Instantly.",
  heroDescription: "Create a temporary note, protect it with a PIN and move it between devices using a code, link or QR. No account required.",
  heroPrimaryButtonText: "Create a note →",
  heroSecondaryButtonText: "Open a code",
  footerTagline: "Temporary text sharing, made simple.",
  aboutTitle: "Simple sharing without an account",
  aboutText: "AirText is a lightweight way to move temporary text between nearby or remote devices.",
  developerName: "Farhan Ali",
  developerRole: "Web Developer",
  developerBio: "Building practical, privacy-conscious tools for the web.",
  developerWebsite: "",
  developerEmail: "",
  socialFacebook: "",
  socialInstagram: "",
  socialX: "",
  socialLinkedIn: "",
  socialGitHub: "",
  socialYouTube: "",
  maintenanceTitle: "AirText is under maintenance",
  maintenanceMessage: "We are making a few improvements. New notes are temporarily paused; please check again shortly.",

  // SEO (admin-manageable)
  seoEnabled: true,
  seoSiteTitle: "AirText — Share text and files nearby or anywhere",
  seoMetaDescription: "Create a temporary note or file, protect it with a PIN and move it between devices using a code, link or QR. No account required.",
  seoKeywords: "temporary text share, quick note share, temporary file share, qr code generator, cross network notes",
  seoOgImageUrl: "",
  seoTwitterHandle: "",
  seoCanonicalBaseUrl: "",
  seoGoogleSiteVerification: "",
  seoRobotsDirective: "index, follow",
});

export type SiteSettings = typeof DEFAULT_SETTINGS;

let settingsCache: SiteSettings | null = null;
let settingsCacheExpiresAt = 0;

export function sanitizeSettings(input: unknown): SiteSettings {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const settings = {} as Record<string, unknown>;

  const longTextFields = new Set([
    "heroDescription", "announcement", "aboutText", "developerBio",
    "footerTagline", "maintenanceMessage", "seoMetaDescription", "seoKeywords",
    "allowedFileExtensions", "blockedFileExtensions",
  ]);
  const urlFields = new Set([
    "developerWebsite", "socialFacebook", "socialInstagram", "socialX",
    "socialLinkedIn", "socialGitHub", "socialYouTube", "seoOgImageUrl", "seoCanonicalBaseUrl",
  ]);

  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const value = source[key];
    if (typeof fallback === "boolean") {
      settings[key] = booleanSetting(value, fallback);
    } else if (typeof fallback === "number") {
      settings[key] = sanitizeNumericSetting(key, value, fallback);
    } else if (key === "defaultTheme") {
      settings[key] = ["system", "dark", "light"].includes(value as string) ? value : fallback;
    } else if (key === "seoRobotsDirective") {
      const allowed = new Set(["index, follow", "noindex, follow", "index, nofollow", "noindex, nofollow"]);
      settings[key] = allowed.has(value as string) ? value : fallback;
    } else {
      const maxLength = urlFields.has(key) ? 500 : longTextFields.has(key) ? 1_000 : 200;
      settings[key] = sanitizeEditableText(value, fallback as string, maxLength, key === "appName");
    }
  }
  return settings as SiteSettings;
}

const NUMERIC_RANGES: Record<string, [number, number]> = {
  ttlSeconds: [5 * 60, 24 * 60 * 60],
  maxTitleLength: [20, 120],
  maxTextLength: [500, 20_000],
  maxLocalItems: [10, 100],
  createCooldownSeconds: [1, 60],
  unlockCooldownSeconds: [1, 30],
  maxFileSizeMB: [1, 200],
  maxTotalStorageMB: [50, 20_000],
  maxBatchTotalMB: [1, 2_000],
  maxFilesPerBatch: [1, 100],
  fileTtlSeconds: [5 * 60, 7 * 24 * 60 * 60],
  fileUploadCooldownSeconds: [1, 120],
  maxActiveFiles: [10, 2_000],
};

export function sanitizeNumericSetting(key: string, value: unknown, fallback: number): number {
  const range = NUMERIC_RANGES[key] || [0, Number.MAX_SAFE_INTEGER];
  return clampInteger(value, range[0], range[1], fallback);
}

export function sanitizeEditableText(value: unknown, fallback: string, maxLength: number, required: boolean): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return required && !cleaned ? fallback : cleaned;
}

export function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

export function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export async function getSiteSettings(env: Env): Promise<SiteSettings> {
  if (settingsCache && settingsCacheExpiresAt > Date.now()) return settingsCache;
  let stored: unknown = null;
  try {
    const row = await env.DB.prepare("SELECT data FROM site_settings WHERE id = 1").first<{ data: string }>();
    stored = row && row.data ? JSON.parse(row.data) : null;
  } catch {
    stored = null;
  }
  settingsCache = sanitizeSettings(stored || {});
  settingsCacheExpiresAt = Date.now() + 15_000;
  return settingsCache;
}

export function setSiteSettingsCache(settings: SiteSettings): void {
  settingsCache = settings;
  settingsCacheExpiresAt = Date.now() + 15_000;
}

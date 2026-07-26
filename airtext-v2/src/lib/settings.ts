import type { Env } from "../types";

/**
 * Ported verbatim from airtext-worker-modern.js:47-212. Every key here must
 * round-trip through sanitizeSettings() unchanged, and the admin settings
 * form (client-side) depends on this exact key set.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  appName: "AirText",
  tagline: "Share text nearby or anywhere",
  headerCreateText: "Share",
  headerAvailableText: "Available",
  headerOpenCodeText: "Open code",
  headerGuideText: "Guide",
  headerFeedbackText: "Feedback",
  headerAboutText: "About",
  headerNewNoteText: "New note →",
  drawerCreateText: "Create a note →",
  drawerOpenCodeText: "Open a share code",
  drawerScanText: "Scan a QR code",
  heroEnabled: true,
  heroEyebrow: "Temporary text sharing",
  heroTitlePrimary: "Share text.",
  heroTitleOutline: "Instantly.",
  heroDescription: "Create a temporary note, protect it with a PIN and move it between devices using a code, link or QR. No account required.",
  heroPrimaryButtonText: "Create a note →",
  heroSecondaryButtonText: "Open a code",
  heroPanelEnabled: true,
  heroPanelEyebrow: "How it moves",
  heroPanelTitle: "One note. Every device.",
  heroPanelText: "Create once, then open it nearby or anywhere using the method that works best.",
  heroPanelStep1: "Create",
  heroPanelStep2: "Share",
  heroPanelStep3: "Open",
  heroPanelStat1Value: "3 ways",
  heroPanelStat1Label: "Link · Code · QR",
  heroPanelStat2Value: "0 accounts",
  heroPanelStat2Label: "Fast and temporary",
  announcementEnabled: true,
  announcementLabel: "NEW",
  announcement: "Move a note to another network with one secure link, short code or QR scan.",
  tickerEnabled: true,
  tickerItem1: "Cross-network sharing",
  tickerItem2: "Automatic expiry",
  tickerItem3: "Clickable links",
  tickerItem4: "Private · Temporary · No account required",
  createSectionEnabled: true,
  createSectionTitle: "Share text",
  createSectionSubtitle: "Available for {duration} · deleted automatically",
  createTitlePlaceholder: "Title",
  createTextPlaceholder: "Type or paste something…",
  createButtonText: "Save note",
  createTemporaryBadge: "Temporary",
  createPrivacyNote: "Only titles appear in the available list. Use a PIN for private content.",
  pinToggleText: "Lock with PIN",
  availableSectionEnabled: true,
  availableTitle: "Available on this network",
  availableSearchPlaceholder: "Search available notes…",
  availableEmptyText: "No shared text yet.",
  openCodeSectionEnabled: true,
  openCodeTitle: "Open a code",
  openCodePlaceholder: "ABC123",
  openCodeButtonText: "Open share",
  scanQrText: "Scan QR instead",
  guideEnabled: true,
  guideEyebrow: "How to use",
  guideTitle: "Share in four steps",
  guideStep1Title: "Create",
  guideStep1Text: "Add a title and paste or type your note.",
  guideStep2Title: "Protect",
  guideStep2Text: "Optionally add a PIN before saving.",
  guideStep3Title: "Share",
  guideStep3Text: "Send the link, short code or QR.",
  guideStep4Title: "Receive",
  guideStep4Text: "Opening it adds the note to that network until expiry.",
  feedbackEnabled: true,
  feedbackEyebrow: "Feedback",
  feedbackTitle: "Help improve AirText",
  feedbackIntro: "Share a suggestion, report a problem or tell us what feels unclear.",
  feedbackMessagePlaceholder: "Tell us what you think…",
  feedbackEmailPlaceholder: "Email (optional)",
  feedbackButtonText: "Submit feedback",
  aboutEnabled: true,
  aboutEyebrow: "About",
  aboutTitle: "Simple sharing without an account",
  aboutText: "AirText is a lightweight way to move temporary text between nearby or remote devices.",
  developerName: "Farhan Ali",
  developerRole: "Web Developer",
  developerBio: "Building practical, privacy-conscious tools for the web.",
  developerWebsite: "",
  developerEmail: "",
  socialLinksEnabled: true,
  socialFacebook: "",
  socialInstagram: "",
  socialX: "",
  socialLinkedIn: "",
  socialGitHub: "",
  socialYouTube: "",
  footerEnabled: true,
  footerTagline: "Temporary text sharing, made simple.",
  footerExploreTitle: "Explore",
  footerInformationTitle: "Information",
  footerConnectTitle: "Connect",
  footerCreateText: "Create note",
  footerAvailableText: "Available notes",
  footerOpenCodeText: "Open code",
  footerGuideText: "How to use",
  footerFeedbackText: "Feedback",
  footerAboutText: "About",
  footerRightsText: "All rights reserved.",
  footerDeveloperPrefix: "Designed and developed by",
  footerShowYear: true,
  footerShowDeveloper: true,
  privacyText: "Notes and configuration use D1. Network addresses are hashed before use; raw IP addresses are not stored in analytics.",
  adminLinkText: "Administrator panel →",
  maintenanceEyebrow: "Scheduled maintenance",
  maintenanceTitle: "AirText is under maintenance",
  maintenanceMessage: "We are making a few improvements. New notes are temporarily paused; please check again shortly.",
  maintenanceButtonText: "Refresh page",
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

  // File sharing (temporary, no account required — mirrors text notes)
  fileSharingEnabled: true,
  headerFilesText: "Files",
  filesSectionTitle: "Share a file",
  filesSectionSubtitle: "Available for {duration} · deleted automatically",
  filesUploadPlaceholder: "Title (optional)",
  filesUploadButtonText: "Upload file",
  filesTemporaryBadge: "Temporary",
  filesPrivacyNote: "Only titles appear in the available list. Use a PIN for private files.",
  filesAvailableTitle: "Files available on this network",
  filesEmptyText: "No shared files yet.",
  filesDropHint: "Drag and drop a file here, or click to choose one.",
  maxFileSizeMB: 2,
  maxTotalStorageMB: 500,
  maxBatchTotalMB: 30,
  maxFilesPerBatch: 15,
  fileTtlSeconds: 60 * 60,
  fileUploadCooldownSeconds: 6,
  maxActiveFiles: 200,
  allowedFileExtensions: "",
  blockedFileExtensions: "exe,bat,cmd,com,msi,scr,dll,jar,ps1,vbs,vbe,js,jse,wsf,apk",

  // Standalone QR generator for links (client-side only, no account required)
  qrLinkToolEnabled: true,
  headerQrToolText: "QR for link",
  qrLinkToolEyebrow: "Utility",
  qrLinkToolTitle: "QR code for any link",
  qrLinkToolSubtitle: "Paste a URL and get an instant QR code. Nothing is saved or sent to a server.",
  qrLinkToolPlaceholder: "https://example.com",
  qrLinkToolButtonText: "Generate QR",
  qrLinkToolDownloadText: "Download PNG",

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
    "heroDescription", "heroPanelText", "announcement", "guideStep1Text", "guideStep2Text",
    "guideStep3Text", "guideStep4Text", "feedbackIntro", "aboutText", "developerBio",
    "footerTagline", "maintenanceMessage", "privacyText", "createPrivacyNote",
    "filesPrivacyNote", "seoMetaDescription", "seoKeywords",
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

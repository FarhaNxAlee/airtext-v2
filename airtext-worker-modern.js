/**
 * AirText — single-file Cloudflare Worker + D1 + R2
 *
 * Required bindings:
 *   1) D1 database binding: DB (select the D1 database named "airtext")
 *   2) Secret: APP_SECRET
 *   3) Secret: ADMIN_PASSWORD (required only for the admin panel)
 *
 * Optional bindings:
 *   - R2 bucket binding: FILES_BUCKET (required only for file sharing — the
 *     rest of the site works without it; file upload/download return a clear
 *     error until it's bound)
 *   - SHARE_KV may remain attached, but this version performs no routine KV writes.
 *
 * Features:
 *   - Same-public-IP local text board
 *   - Multiple temporary text shares
 *   - Temporary file sharing (R2-backed), same no-account model as text notes
 *   - Optional PIN lock (notes and files)
 *   - Cross-network share code and link for both notes (/s/CODE) and files (/f/CODE)
 *   - QR generation and camera scanning for notes and files, plus a standalone
 *     QR generator for arbitrary links (client-side only, no account required)
 *   - Creator-only deletion using a private browser token
 *   - D1-backed automatic expiry and immediate consistent lists; expired files
 *     are also purged from R2
 *   - Safe clickable web, email, phone, localhost, and IP links inside shared text
 *   - Cross-network received-note and received-file boards
 *   - Light and dark themes
 *   - Admin dashboard organized into tabs (Overview, Notes, Files, Feedback,
 *     Settings) with file-storage usage, per-feature limits, and a Danger Zone
 *     for maintenance mode
 *   - Admin-configurable SEO (title, description, keywords, OG/Twitter tags,
 *     canonical URL, robots directive, Google site verification),
 *     plus /robots.txt and /sitemap.xml routes
 *   - Responsive single-file production frontend
 */

const CONFIG = Object.freeze({
  MIN_PIN_LENGTH: 4,
  MAX_PIN_LENGTH: 32,
  SHARE_CODE_LENGTH: 6,
  ADMIN_SESSION_SECONDS: 8 * 60 * 60,
  ANALYTICS_RETENTION_SECONDS: 90 * 24 * 60 * 60,
  FEEDBACK_RETENTION_SECONDS: 180 * 24 * 60 * 60,
});

const DEFAULT_SETTINGS = Object.freeze({
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
  maxFileSizeMB: 25,
  maxTotalStorageMB: 500,
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

let settingsCache = null;
let settingsCacheExpiresAt = 0;
let databaseSchemaPromise = null;
let lastCleanupAt = 0;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate",
  "x-content-type-options": "nosniff",
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(self), microphone=(), geolocation=()",
  "content-security-policy": [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

export default {
  async fetch(request, env) {
    try {
      const setupProblem = getSetupProblem(env);
      if (setupProblem) {
        return new Response(renderSetupPage(setupProblem), {
          status: 500,
          headers: HTML_HEADERS,
        });
      }

      await ensureD1Schema(env);
      await maybeCleanupD1(env);

      const url = new URL(request.url);
      const path = normalizePath(url.pathname);
      const method = request.method.toUpperCase();

      if (path === "/favicon.ico") {
        return new Response(null, { status: 204 });
      }

      if (path === "/robots.txt") {
        return await handleRobotsTxt(request, env, url);
      }

      if (path === "/sitemap.xml") {
        return await handleSitemapXml(request, env, url);
      }

      // Public API routes
      if (path === "/api/local/items" && method === "GET") {
        return await d1HandleListLocalItems(request, env);
      }

      if (path === "/api/items" && method === "POST") {
        return await d1HandleCreateItem(request, env, url);
      }

      let match = path.match(/^\/api\/local\/item\/([A-Za-z0-9_-]{8,64})$/);
      if (match && method === "GET") {
        return await d1HandleGetLocalItem(request, env, match[1]);
      }

      match = path.match(/^\/api\/local\/item\/([A-Za-z0-9_-]{8,64})\/unlock$/);
      if (match && method === "POST") {
        return await d1HandleUnlockLocalItem(request, env, match[1]);
      }

      match = path.match(/^\/api\/share\/([A-Za-z0-9]{4,12})$/);
      if (match && method === "GET") {
        return await d1HandleGetSharedItem(request, env, match[1], url);
      }

      match = path.match(/^\/api\/share\/([A-Za-z0-9]{4,12})\/unlock$/);
      if (match && method === "POST") {
        return await d1HandleUnlockSharedItem(request, env, match[1], url);
      }

      match = path.match(/^\/api\/item\/([A-Za-z0-9_-]{8,64})$/);
      if (match && method === "DELETE") {
        return await d1HandleDeleteItem(request, env, match[1]);
      }

      if (path === "/api/feedback" && method === "POST") {
        return await d1HandleSubmitFeedback(request, env);
      }

      // Public file-sharing API routes (temporary, no account required)
      if (path === "/api/local/files" && method === "GET") {
        return await d1HandleListLocalFiles(request, env);
      }

      if (path === "/api/files" && method === "POST") {
        return await d1HandleCreateFile(request, env, url);
      }

      match = path.match(/^\/api\/local\/file\/([A-Za-z0-9_-]{8,64})$/);
      if (match && method === "GET") {
        return await d1HandleGetLocalFile(request, env, match[1]);
      }

      match = path.match(/^\/api\/local\/file\/([A-Za-z0-9_-]{8,64})\/unlock$/);
      if (match && method === "POST") {
        return await d1HandleUnlockLocalFile(request, env, match[1]);
      }

      match = path.match(/^\/api\/share\/file\/([A-Za-z0-9]{4,12})$/);
      if (match && method === "GET") {
        return await d1HandleGetSharedFile(request, env, match[1], url);
      }

      match = path.match(/^\/api\/share\/file\/([A-Za-z0-9]{4,12})\/unlock$/);
      if (match && method === "POST") {
        return await d1HandleUnlockSharedFile(request, env, match[1], url);
      }

      match = path.match(/^\/api\/file\/([A-Za-z0-9_-]{8,64})\/download$/);
      if (match && method === "GET") {
        return await d1HandleDownloadFile(request, env, match[1], url);
      }

      match = path.match(/^\/api\/file\/([A-Za-z0-9_-]{8,64})$/);
      if (match && method === "DELETE") {
        return await d1HandleDeleteFile(request, env, match[1]);
      }

      // Admin authentication and API routes
      if (path === "/api/admin/session" && method === "GET") {
        return await handleAdminSession(request, env);
      }

      if (path === "/api/admin/login" && method === "POST") {
        return await d1HandleAdminLogin(request, env);
      }

      if (path === "/api/admin/logout" && method === "POST") {
        return handleAdminLogout();
      }

      if (path === "/api/admin/dashboard" && method === "GET") {
        return await d1HandleAdminDashboard(request, env);
      }

      if (path === "/api/admin/settings" && method === "PATCH") {
        return await d1HandleAdminSettingsUpdate(request, env);
      }

      match = path.match(/^\/api\/admin\/item\/([A-Za-z0-9_-]{8,64})$/);
      if (match && method === "DELETE") {
        return await d1HandleAdminDeleteItem(request, env, match[1]);
      }

      match = path.match(/^\/api\/admin\/file\/([A-Za-z0-9_-]{8,64})$/);
      if (match && method === "DELETE") {
        return await d1HandleAdminDeleteFile(request, env, match[1]);
      }

      match = path.match(/^\/api\/admin\/feedback\/([A-Za-z0-9_-]{8,64})$/);
      if (match && method === "PATCH") {
        return await d1HandleAdminFeedbackUpdate(request, env, match[1]);
      }
      if (match && method === "DELETE") {
        return await d1HandleAdminFeedbackDelete(request, env, match[1]);
      }

      if (path.startsWith("/api/")) {
        return jsonError("API route not found.", 404);
      }

      const siteSettings = await getSiteSettings(env);
      const codeMatch = path.match(/^\/s\/([A-Za-z0-9]{4,12})$/);
      const fileCodeMatch = path.match(/^\/f\/([A-Za-z0-9]{4,12})$/);
      const initialShareCode = codeMatch ? normalizeShareCode(codeMatch[1]) : "";
      const initialFileShareCode = fileCodeMatch ? normalizeShareCode(fileCodeMatch[1]) : "";
      const initialShareVia = url.searchParams.get("via") === "qr" ? "qr" : "link";
      const initialAdmin = path === "/admin";

      if (path !== "/" && !initialShareCode && !initialFileShareCode && !initialAdmin) {
        return new Response(renderRuntimeErrorPage("Page not found."), {
          status: 404,
          headers: HTML_HEADERS,
        });
      }

      return new Response(renderAppPage({
        ...siteSettings,
        initialShareCode,
        initialFileShareCode,
        initialShareVia,
        initialAdmin,
        minPinLength: CONFIG.MIN_PIN_LENGTH,
        maxPinLength: CONFIG.MAX_PIN_LENGTH,
        canonicalPath: path,
        requestOrigin: url.origin,
      }), {
        status: 200,
        headers: HTML_HEADERS,
      });
    } catch (error) {
      console.error("Unhandled Worker error", error);
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        return jsonError("Unexpected server error.", 500);
      }
      return new Response(renderRuntimeErrorPage(), {
        status: 500,
        headers: HTML_HEADERS,
      });
    }
  },
};

/* -------------------------------------------------------------------------- */
/* API handlers                                                                */
/* -------------------------------------------------------------------------- */

async function handleListLocalItems(request, env) {
  const settings = await getSiteSettings(env);
  const roomId = await getRoomId(request, env.APP_SECRET);
  const prefix = `room:${roomId}:item:`;
  const now = Date.now();
  const collected = [];
  let cursor;
  let pages = 0;

  do {
    const result = await env.SHARE_KV.list({
      prefix,
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });

    for (const key of result.keys) {
      const metadata = key.metadata;
      if (!metadata || typeof metadata !== "object") continue;
      if (!metadata.id || !metadata.title || !metadata.expiresAt) continue;
      if (Number(metadata.expiresAt) <= now) continue;

      collected.push({
        id: String(metadata.id),
        title: String(metadata.title),
        locked: Boolean(metadata.locked),
        code: String(metadata.code || ""),
        createdAt: Number(metadata.createdAt || 0),
        addedAt: Number(metadata.addedAt || metadata.createdAt || 0),
        expiresAt: Number(metadata.expiresAt),
        source: metadata.source === "received" ? "received" : "mine",
      });
    }

    cursor = result.list_complete ? undefined : result.cursor;
    pages += 1;
  } while (cursor && pages < 5 && collected.length < settings.maxLocalItems * 2);

  collected.sort((a, b) => b.addedAt - a.addedAt);

  return jsonResponse({
    ok: true,
    items: collected.slice(0, settings.maxLocalItems),
    expiresAfterSeconds: settings.ttlSeconds,
    networkNotice: "The local board is grouped by the public IP address visible to Cloudflare.",
  });
}

async function handleCreateItem(request, env, url) {
  const settings = await getSiteSettings(env);
  if (settings.maintenanceMode || !settings.notesEnabled) {
    return jsonError("New notes are temporarily unavailable.", 503, "NOTES_DISABLED");
  }

  const body = await readJsonBody(request, Math.max(24_000, settings.maxTextLength + 2_000));
  if (!body.ok) return body.response;

  const title = normalizeTitle(body.data.title);
  const text = normalizeText(body.data.text);
  const wantsLock = settings.pinEnabled && Boolean(body.data.locked);
  const pin = typeof body.data.pin === "string" ? body.data.pin.trim() : "";

  if (!title) return jsonError("Please enter a title.", 400, "TITLE_REQUIRED");
  if (title.length > settings.maxTitleLength) {
    return jsonError(`Title must be ${settings.maxTitleLength} characters or fewer.`, 400, "TITLE_TOO_LONG");
  }
  if (!text) return jsonError("Please enter text to share.", 400, "TEXT_REQUIRED");
  if (text.length > settings.maxTextLength) {
    return jsonError(`Text must be ${settings.maxTextLength.toLocaleString()} characters or fewer.`, 400, "TEXT_TOO_LONG");
  }

  if (wantsLock && (pin.length < CONFIG.MIN_PIN_LENGTH || pin.length > CONFIG.MAX_PIN_LENGTH)) {
    return jsonError(
      `PIN must be between ${CONFIG.MIN_PIN_LENGTH} and ${CONFIG.MAX_PIN_LENGTH} characters.`,
      400,
      "INVALID_PIN_LENGTH",
    );
  }

  const clientIpHash = await getClientIpHash(request, env.APP_SECRET);
  const rateResult = await enforceCooldown(
    env.SHARE_KV,
    `rate:create:${clientIpHash}`,
    settings.createCooldownSeconds,
  );
  if (!rateResult.allowed) {
    return jsonError(
      `Please wait ${rateResult.retryAfter} second${rateResult.retryAfter === 1 ? "" : "s"} before creating another share.`,
      429,
      "CREATE_RATE_LIMIT",
      { "retry-after": String(rateResult.retryAfter) },
    );
  }

  const roomId = await getRoomId(request, env.APP_SECRET);
  const id = randomBase64Url(16);
  const code = await createUniqueShareCode(env.SHARE_KV);
  const deleteToken = randomBase64Url(32);
  const deleteTokenHash = await hmacHex(env.APP_SECRET, `delete:${deleteToken}`);
  const createdAt = Date.now();
  const expiresAt = createdAt + settings.ttlSeconds * 1000;
  const adminIndexKey = `admin-note:${String(createdAt).padStart(13, "0")}:${id}`;

  let pinSalt = null;
  let pinHash = null;
  if (wantsLock) {
    pinSalt = randomBase64Url(18);
    pinHash = await hashPin(env.APP_SECRET, pinSalt, pin);
  }

  const item = {
    version: 1,
    id,
    roomId,
    title,
    text,
    locked: wantsLock,
    pinSalt,
    pinHash,
    code,
    deleteTokenHash,
    adminIndexKey,
    createdAt,
    expiresAt,
  };

  const listMetadata = {
    id,
    title,
    locked: wantsLock,
    code,
    createdAt,
    addedAt: createdAt,
    expiresAt,
    source: "mine",
  };

  await Promise.all([
    env.SHARE_KV.put(`item:${id}`, JSON.stringify(item), {
      expirationTtl: settings.ttlSeconds,
    }),
    env.SHARE_KV.put(`code:${code}`, id, {
      expirationTtl: settings.ttlSeconds,
    }),
    env.SHARE_KV.put(adminIndexKey, "", {
      expirationTtl: settings.ttlSeconds,
      metadata: {
        ...listMetadata,
        roomHash: roomId.slice(0, 12),
      },
    }),
    addItemToRoom(env.SHARE_KV, item, roomId, "mine"),
  ]);

  await recordEvent(env, request, "note_created", { locked: wantsLock });

  return jsonResponse({
    ok: true,
    item: listMetadata,
    deleteToken,
    shareUrl: `${url.origin}/s/${code}`,
    message: `Share created. It will expire automatically in ${formatServerDuration(settings.ttlSeconds)}.`,
  }, 201);
}

async function handleGetLocalItem(request, env, itemId) {
  const item = await getItem(env.SHARE_KV, itemId);
  if (!item || isExpired(item)) return jsonError("This share has expired or does not exist.", 404, "NOT_FOUND");

  const roomId = await getRoomId(request, env.APP_SECRET);
  const membership = await env.SHARE_KV.get(`room-member:${roomId}:${item.id}`);
  if (!membership && constantTimeEqual(roomId, item.roomId)) {
    await addItemToRoom(env.SHARE_KV, item, roomId, "mine");
  } else if (!membership) {
    return jsonError("This item belongs to a different local network.", 403, "WRONG_NETWORK");
  }

  await recordEvent(env, request, "note_opened", { via: "network" });
  return jsonResponse(publicItemPayload(item, !item.locked));
}

async function handleUnlockLocalItem(request, env, itemId) {
  const item = await getItem(env.SHARE_KV, itemId);
  if (!item || isExpired(item)) return jsonError("This share has expired or does not exist.", 404, "NOT_FOUND");

  const roomId = await getRoomId(request, env.APP_SECRET);
  const membership = await env.SHARE_KV.get(`room-member:${roomId}:${item.id}`);
  if (!membership && constantTimeEqual(roomId, item.roomId)) {
    await addItemToRoom(env.SHARE_KV, item, roomId, "mine");
  } else if (!membership) {
    return jsonError("This item belongs to a different local network.", 403, "WRONG_NETWORK");
  }

  const result = await verifyPin(request, env, item);
  if (!result.ok) return result.response;
  await recordEvent(env, request, "pin_unlocked", { via: "network" });
  return jsonResponse(publicItemPayload(item, true));
}

async function handleGetSharedItem(request, env, rawCode, url) {
  const settings = await getSiteSettings(env);
  const code = normalizeShareCode(rawCode);
  const itemId = await env.SHARE_KV.get(`code:${code}`);
  if (!itemId) return jsonError("This share code is invalid or has expired.", 404, "CODE_NOT_FOUND");

  const item = await getItem(env.SHARE_KV, itemId);
  if (!item || isExpired(item)) return jsonError("This share has expired or does not exist.", 404, "NOT_FOUND");

  const via = normalizeAccessMethod(url.searchParams.get("via"));
  if (!item.locked && settings.crossNetworkAddEnabled) {
    const roomId = await getRoomId(request, env.APP_SECRET);
    await addItemToRoom(env.SHARE_KV, item, roomId, constantTimeEqual(roomId, item.roomId) ? "mine" : "received");
  }
  await recordEvent(env, request, "shared_note_opened", { via, locked: item.locked });
  return jsonResponse(publicItemPayload(item, !item.locked));
}

async function handleUnlockSharedItem(request, env, rawCode, url) {
  const settings = await getSiteSettings(env);
  const code = normalizeShareCode(rawCode);
  const itemId = await env.SHARE_KV.get(`code:${code}`);
  if (!itemId) return jsonError("This share code is invalid or has expired.", 404, "CODE_NOT_FOUND");

  const item = await getItem(env.SHARE_KV, itemId);
  if (!item || isExpired(item)) return jsonError("This share has expired or does not exist.", 404, "NOT_FOUND");

  const result = await verifyPin(request, env, item);
  if (!result.ok) return result.response;

  if (settings.crossNetworkAddEnabled) {
    const roomId = await getRoomId(request, env.APP_SECRET);
    await addItemToRoom(env.SHARE_KV, item, roomId, constantTimeEqual(roomId, item.roomId) ? "mine" : "received");
  }
  await recordEvent(env, request, "pin_unlocked", { via: normalizeAccessMethod(url.searchParams.get("via")) });
  return jsonResponse(publicItemPayload(item, true));
}

async function verifyPin(request, env, item) {
  if (!item.locked) return { ok: true };
  const settings = await getSiteSettings(env);

  const body = await readJsonBody(request, 2_000);
  if (!body.ok) return { ok: false, response: body.response };

  const pin = typeof body.data.pin === "string" ? body.data.pin.trim() : "";
  if (!pin) return { ok: false, response: jsonError("Enter the PIN to unlock this text.", 400, "PIN_REQUIRED") };
  if (pin.length > CONFIG.MAX_PIN_LENGTH) {
    return { ok: false, response: jsonError("Invalid PIN.", 400, "INVALID_PIN") };
  }

  const clientIpHash = await getClientIpHash(request, env.APP_SECRET);
  const rateResult = await enforceCooldown(
    env.SHARE_KV,
    `rate:unlock:${item.id}:${clientIpHash}`,
    settings.unlockCooldownSeconds,
  );
  if (!rateResult.allowed) {
    return { ok: false, response: jsonError(
      `Please wait ${rateResult.retryAfter} second${rateResult.retryAfter === 1 ? "" : "s"} and try again.`,
      429,
      "UNLOCK_RATE_LIMIT",
      { "retry-after": String(rateResult.retryAfter) },
    ) };
  }

  const suppliedHash = await hashPin(env.APP_SECRET, item.pinSalt, pin);
  if (!constantTimeEqual(suppliedHash, item.pinHash)) {
    await recordEvent(env, request, "pin_failed");
    return { ok: false, response: jsonError("Incorrect PIN.", 401, "WRONG_PIN") };
  }

  return { ok: true };
}

async function handleDeleteItem(request, env, itemId) {
  const item = await getItem(env.SHARE_KV, itemId);
  if (!item || isExpired(item)) return jsonError("This share has already expired or does not exist.", 404, "NOT_FOUND");

  const body = await readJsonBody(request, 4_000);
  if (!body.ok) return body.response;

  const token = typeof body.data.deleteToken === "string" ? body.data.deleteToken : "";
  if (!token) return jsonError("Delete token is required.", 401, "DELETE_TOKEN_REQUIRED");

  const suppliedHash = await hmacHex(env.APP_SECRET, `delete:${token}`);
  if (!constantTimeEqual(suppliedHash, item.deleteTokenHash)) {
    return jsonError("You can delete this item only from the browser that created it.", 403, "INVALID_DELETE_TOKEN");
  }

  await deleteItemEverywhere(env.SHARE_KV, item);
  await recordEvent(env, request, "note_deleted", { by: "creator" });

  return jsonResponse({ ok: true, message: "Share deleted." });
}

async function handleSubmitFeedback(request, env) {
  const settings = await getSiteSettings(env);
  if (!settings.feedbackEnabled) {
    return jsonError("Feedback is currently disabled.", 403, "FEEDBACK_DISABLED");
  }

  const body = await readJsonBody(request, 6_000);
  if (!body.ok) return body.response;

  const allowedCategories = ["bug", "suggestion", "design", "other"];
  const category = allowedCategories.includes(body.data.category) ? body.data.category : "other";
  const message = typeof body.data.message === "string" ? body.data.message.trim() : "";
  const email = typeof body.data.email === "string" ? body.data.email.trim().slice(0, 200) : "";
  const rating = Math.max(0, Math.min(5, Number(body.data.rating || 0)));

  if (message.length < 5 || message.length > 2_000) {
    return jsonError("Feedback must be between 5 and 2,000 characters.", 400, "INVALID_FEEDBACK");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("Enter a valid email address or leave it empty.", 400, "INVALID_EMAIL");
  }

  const clientHash = await getClientIpHash(request, env.APP_SECRET);
  const cooldown = await enforceCooldown(env.SHARE_KV, `rate:feedback:${clientHash}`, 60);
  if (!cooldown.allowed) {
    return jsonError(`Please wait ${cooldown.retryAfter} seconds before submitting again.`, 429, "FEEDBACK_RATE_LIMIT");
  }

  const id = randomBase64Url(12);
  const createdAt = Date.now();
  const indexKey = `feedback-index:${String(createdAt).padStart(13, "0")}:${id}`;
  const feedback = {
    id,
    category,
    message,
    email,
    rating: Number.isFinite(rating) ? rating : 0,
    status: "new",
    createdAt,
  };

  await Promise.all([
    env.SHARE_KV.put(indexKey, JSON.stringify(feedback), {
      expirationTtl: CONFIG.FEEDBACK_RETENTION_SECONDS,
      metadata: { id, category, status: "new", createdAt },
    }),
    env.SHARE_KV.put(`feedback-id:${id}`, indexKey, {
      expirationTtl: CONFIG.FEEDBACK_RETENTION_SECONDS,
    }),
  ]);
  await recordEvent(env, request, "feedback_submitted", { category });

  return jsonResponse({ ok: true, message: "Thank you. Your feedback has been submitted." }, 201);
}

async function handleAdminSession(request, env) {
  const configured = Boolean(env.ADMIN_PASSWORD && String(env.ADMIN_PASSWORD).length >= 8);
  const authenticated = configured ? await isAdminRequest(request, env) : false;
  return jsonResponse({ ok: true, configured, authenticated });
}

async function handleAdminLogin(request, env) {
  if (!env.ADMIN_PASSWORD || String(env.ADMIN_PASSWORD).length < 8) {
    return jsonError("Add an ADMIN_PASSWORD secret with at least 8 characters.", 503, "ADMIN_NOT_CONFIGURED");
  }

  const body = await readJsonBody(request, 2_000);
  if (!body.ok) return body.response;
  const password = typeof body.data.password === "string" ? body.data.password : "";

  const clientHash = await getClientIpHash(request, env.APP_SECRET);
  const cooldown = await enforceCooldown(env.SHARE_KV, `rate:admin:${clientHash}`, 3);
  if (!cooldown.allowed) {
    return jsonError(`Please wait ${cooldown.retryAfter} seconds and try again.`, 429, "ADMIN_RATE_LIMIT");
  }

  const supplied = await hmacHex(env.APP_SECRET, `admin-password:${password}`);
  const expected = await hmacHex(env.APP_SECRET, `admin-password:${env.ADMIN_PASSWORD}`);
  if (!constantTimeEqual(supplied, expected)) {
    await recordEvent(env, request, "admin_login_failed");
    return jsonError("Incorrect administrator password.", 401, "INVALID_ADMIN_PASSWORD");
  }

  const token = await createAdminSessionToken(env.APP_SECRET);
  await recordEvent(env, request, "admin_login");
  return jsonResponse(
    { ok: true, message: "Signed in." },
    200,
    { "set-cookie": buildAdminCookie(token, CONFIG.ADMIN_SESSION_SECONDS) },
  );
}

function handleAdminLogout() {
  return jsonResponse(
    { ok: true, message: "Signed out." },
    200,
    { "set-cookie": buildAdminCookie("", 0) },
  );
}

async function handleAdminDashboard(request, env) {
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  const settings = await getSiteSettings(env);
  const now = Date.now();
  const [noteKeys, feedbackKeys, eventKeys] = await Promise.all([
    listKvKeys(env.SHARE_KV, "admin-note:", 500, 8),
    listKvKeys(env.SHARE_KV, "feedback-index:", 200, 6),
    listKvKeys(env.SHARE_KV, "analytics:", 2_000, 10),
  ]);

  const notes = noteKeys
    .map((key) => key.metadata)
    .filter((item) => item && Number(item.expiresAt) > now)
    .map((item) => ({
      id: String(item.id),
      title: String(item.title || "Untitled"),
      locked: Boolean(item.locked),
      code: String(item.code || ""),
      createdAt: Number(item.createdAt || 0),
      expiresAt: Number(item.expiresAt || 0),
      roomHash: String(item.roomHash || ""),
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100);

  const feedback = (await Promise.all(
    feedbackKeys.slice(0, 100).map(async (key) => {
      try {
        const raw = await env.SHARE_KV.get(key.name);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }),
  ))
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));

  const counts = Object.create(null);
  const uniqueNetworks = new Set();
  const chartMap = Object.create(null);
  for (const key of eventKeys) {
    const metadata = key.metadata;
    if (!metadata || !metadata.type) continue;
    counts[metadata.type] = (counts[metadata.type] || 0) + 1;
    if (metadata.network) uniqueNetworks.add(metadata.network);
    const date = String(metadata.date || "");
    if (date) chartMap[date] = (chartMap[date] || 0) + 1;
  }

  const chart = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now - offset * 86_400_000).toISOString().slice(0, 10);
    chart.push({ date, count: chartMap[date] || 0 });
  }

  return jsonResponse({
    ok: true,
    settings,
    stats: {
      activeNotes: notes.length,
      createdNotes: counts.note_created || 0,
      noteOpens: (counts.note_opened || 0) + (counts.shared_note_opened || 0),
      receivedOpens: counts.shared_note_opened || 0,
      feedbackTotal: feedback.length,
      feedbackNew: feedback.filter((item) => item.status === "new").length,
      uniqueNetworks: uniqueNetworks.size,
      pinFailures: counts.pin_failed || 0,
    },
    eventCounts: counts,
    chart,
    notes,
    feedback,
  });
}

async function handleAdminSettingsUpdate(request, env) {
  const authError = await requireAdmin(request, env, true);
  if (authError) return authError;

  const body = await readJsonBody(request, 12_000);
  if (!body.ok) return body.response;
  const current = await getSiteSettings(env);
  const settings = sanitizeSettings({ ...current, ...body.data });
  await env.SHARE_KV.put("settings:site", JSON.stringify(settings));
  settingsCache = settings;
  settingsCacheExpiresAt = Date.now() + 15_000;
  await recordEvent(env, request, "settings_updated");
  return jsonResponse({ ok: true, settings, message: "Settings saved." });
}

async function handleAdminDeleteItem(request, env, itemId) {
  const authError = await requireAdmin(request, env, true);
  if (authError) return authError;
  const item = await getItem(env.SHARE_KV, itemId);
  if (!item || isExpired(item)) return jsonError("The note has expired or does not exist.", 404, "NOT_FOUND");
  await deleteItemEverywhere(env.SHARE_KV, item);
  await recordEvent(env, request, "note_deleted", { by: "admin" });
  return jsonResponse({ ok: true, message: "Note deleted." });
}

async function handleAdminFeedbackUpdate(request, env, feedbackId) {
  const authError = await requireAdmin(request, env, true);
  if (authError) return authError;
  const body = await readJsonBody(request, 2_000);
  if (!body.ok) return body.response;
  const allowed = ["new", "reviewed", "resolved"];
  const status = allowed.includes(body.data.status) ? body.data.status : "";
  if (!status) return jsonError("Invalid feedback status.", 400, "INVALID_STATUS");

  const indexKey = await env.SHARE_KV.get(`feedback-id:${feedbackId}`);
  if (!indexKey) return jsonError("Feedback not found.", 404, "NOT_FOUND");
  const raw = await env.SHARE_KV.get(indexKey);
  if (!raw) return jsonError("Feedback not found.", 404, "NOT_FOUND");
  const feedback = JSON.parse(raw);
  feedback.status = status;
  feedback.updatedAt = Date.now();

  await env.SHARE_KV.put(indexKey, JSON.stringify(feedback), {
    expirationTtl: CONFIG.FEEDBACK_RETENTION_SECONDS,
    metadata: {
      id: feedback.id,
      category: feedback.category,
      status,
      createdAt: feedback.createdAt,
    },
  });
  return jsonResponse({ ok: true, feedback });
}

async function handleAdminFeedbackDelete(request, env, feedbackId) {
  const authError = await requireAdmin(request, env, true);
  if (authError) return authError;
  const mappingKey = `feedback-id:${feedbackId}`;
  const indexKey = await env.SHARE_KV.get(mappingKey);
  if (!indexKey) return jsonError("Feedback not found.", 404, "NOT_FOUND");
  await Promise.all([
    env.SHARE_KV.delete(mappingKey),
    env.SHARE_KV.delete(indexKey),
  ]);
  return jsonResponse({ ok: true, message: "Feedback deleted." });
}

/* -------------------------------------------------------------------------- */
/* Data and security helpers                                                   */
/* -------------------------------------------------------------------------- */

function getSetupProblem(env) {
  if (!env.DB) {
    return "Missing D1 database binding named DB. Bind your airtext D1 database using the variable name DB.";
  }
  if (!env.APP_SECRET || String(env.APP_SECRET).length < 24) {
    return "Missing or weak APP_SECRET. Add a secret named APP_SECRET with at least 24 random characters.";
  }
  return "";
}

async function getSiteSettings(env) {
  if (settingsCache && settingsCacheExpiresAt > Date.now()) return settingsCache;
  let stored = null;
  try {
    const row = await env.DB.prepare("SELECT data FROM site_settings WHERE id = 1").first();
    stored = row && row.data ? JSON.parse(row.data) : null;
  } catch {
    stored = null;
  }
  settingsCache = sanitizeSettings(stored || {});
  settingsCacheExpiresAt = Date.now() + 15_000;
  return settingsCache;
}

function sanitizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const settings = {};
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
      settings[key] = ["system", "dark", "light"].includes(value) ? value : fallback;
    } else if (key === "seoRobotsDirective") {
      const allowed = new Set(["index, follow", "noindex, follow", "index, nofollow", "noindex, nofollow"]);
      settings[key] = allowed.has(value) ? value : fallback;
    } else {
      const maxLength = urlFields.has(key) ? 500 : longTextFields.has(key) ? 1_000 : 200;
      settings[key] = sanitizeEditableText(value, fallback, maxLength, key === "appName");
    }
  }
  return settings;
}

function sanitizeNumericSetting(key, value, fallback) {
  const ranges = {
    ttlSeconds: [5 * 60, 24 * 60 * 60],
    maxTitleLength: [20, 120],
    maxTextLength: [500, 20_000],
    maxLocalItems: [10, 100],
    createCooldownSeconds: [1, 60],
    unlockCooldownSeconds: [1, 30],
    maxFileSizeMB: [1, 200],
    maxTotalStorageMB: [50, 20_000],
    fileTtlSeconds: [5 * 60, 7 * 24 * 60 * 60],
    fileUploadCooldownSeconds: [1, 120],
    maxActiveFiles: [10, 2_000],
  };
  const range = ranges[key] || [0, Number.MAX_SAFE_INTEGER];
  return clampInteger(value, range[0], range[1], fallback);
}

function sanitizeEditableText(value, fallback, maxLength, required) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return required && !cleaned ? fallback : cleaned;
}

function cleanSettingText(value, fallback, maxLength) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return cleaned || fallback;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function booleanSetting(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

async function getItem(kv, itemId) {
  const raw = await kv.get(`item:${itemId}`);
  if (!raw) return null;
  try {
    const item = JSON.parse(raw);
    return item && typeof item === "object" ? item : null;
  } catch {
    return null;
  }
}

function publicItemPayload(item, includeText) {
  return {
    ok: true,
    item: {
      id: item.id,
      title: item.title,
      locked: Boolean(item.locked),
      code: item.code,
      createdAt: Number(item.createdAt),
      expiresAt: Number(item.expiresAt),
      ...(includeText ? { text: item.text } : {}),
    },
  };
}

async function addItemToRoom(kv, item, roomId, source) {
  const remainingSeconds = Math.max(1, Math.ceil((Number(item.expiresAt) - Date.now()) / 1000));
  if (remainingSeconds <= 1 || isExpired(item)) return;

  const mappingKey = `room-member:${roomId}:${item.id}`;
  const existing = await kv.get(mappingKey);
  if (existing) return;

  const addedAt = Date.now();
  const indexKey = `room:${roomId}:item:${String(addedAt).padStart(13, "0")}:${item.id}`;
  const metadata = {
    id: item.id,
    title: item.title,
    locked: Boolean(item.locked),
    code: item.code,
    createdAt: Number(item.createdAt),
    addedAt,
    expiresAt: Number(item.expiresAt),
    source: source === "received" ? "received" : "mine",
  };

  await Promise.all([
    kv.put(indexKey, "", { expirationTtl: remainingSeconds, metadata }),
    kv.put(mappingKey, indexKey, { expirationTtl: remainingSeconds }),
    kv.put(`item-room:${item.id}:${roomId}`, "", {
      expirationTtl: remainingSeconds,
      metadata: { indexKey, mappingKey },
    }),
  ]);
}

async function deleteItemEverywhere(kv, item) {
  const reverseKeys = await listKvKeys(kv, `item-room:${item.id}:`, 1_000, 12);
  const deleteKeys = new Set([
    `item:${item.id}`,
    `code:${item.code}`,
    item.adminIndexKey,
    item.indexKey,
  ].filter(Boolean));

  for (const key of reverseKeys) {
    deleteKeys.add(key.name);
    if (key.metadata && key.metadata.indexKey) deleteKeys.add(String(key.metadata.indexKey));
    if (key.metadata && key.metadata.mappingKey) deleteKeys.add(String(key.metadata.mappingKey));
  }
  await Promise.all(Array.from(deleteKeys).map((key) => kv.delete(key)));
}

async function listKvKeys(kv, prefix, maxItems, maxPages) {
  const keys = [];
  let cursor;
  let pages = 0;
  do {
    const remaining = Math.max(1, maxItems - keys.length);
    const result = await kv.list({
      prefix,
      limit: Math.min(1_000, remaining),
      ...(cursor ? { cursor } : {}),
    });
    keys.push(...result.keys);
    cursor = result.list_complete ? undefined : result.cursor;
    pages += 1;
  } while (cursor && pages < maxPages && keys.length < maxItems);
  return keys.slice(0, maxItems);
}

async function recordEvent(env, request, type, details = {}) {
  try {
    const settings = await getSiteSettings(env);
    if (!settings.analyticsEnabled) return;
    const at = Date.now();
    const date = new Date(at).toISOString().slice(0, 10);
    const network = (await hmacHex(env.APP_SECRET, `analytics:${date}:${getClientIp(request)}`)).slice(0, 18);
    const metadata = {
      type: String(type).slice(0, 40),
      at,
      date,
      network,
      device: detectDevice(request.headers.get("user-agent")),
      via: normalizeAccessMethod(details.via),
      locked: Boolean(details.locked),
      category: typeof details.category === "string" ? details.category.slice(0, 24) : "",
      by: typeof details.by === "string" ? details.by.slice(0, 16) : "",
    };
    await env.SHARE_KV.put(
      `analytics:${String(at).padStart(13, "0")}:${randomBase64Url(8)}`,
      "",
      { expirationTtl: CONFIG.ANALYTICS_RETENTION_SECONDS, metadata },
    );
  } catch (error) {
    console.warn("Analytics write skipped", error);
  }
}

function detectDevice(userAgent) {
  const ua = String(userAgent || "");
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

function normalizeAccessMethod(value) {
  return ["link", "code", "qr", "network"].includes(value) ? value : "link";
}

async function requireAdmin(request, env, requireMutationHeader = false) {
  if (!env.ADMIN_PASSWORD || String(env.ADMIN_PASSWORD).length < 8) {
    return jsonError("Administrator access is not configured.", 503, "ADMIN_NOT_CONFIGURED");
  }
  if (requireMutationHeader && request.headers.get("x-airtext-admin") !== "1") {
    return jsonError("Missing administrator request header.", 403, "ADMIN_HEADER_REQUIRED");
  }
  if (!(await isAdminRequest(request, env))) {
    return jsonError("Administrator authentication required.", 401, "ADMIN_AUTH_REQUIRED");
  }
  return null;
}

async function isAdminRequest(request, env) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies["__Host-airtext_admin"];
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expected = await hmacHex(env.APP_SECRET, `admin-session:${parts[0]}`);
  if (!constantTimeEqual(expected, parts[1])) return false;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]));
    return Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function createAdminSessionToken(secret) {
  const payload = base64UrlEncode(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + CONFIG.ADMIN_SESSION_SECONDS,
    nonce: randomBase64Url(12),
  }));
  const signature = await hmacHex(secret, `admin-session:${payload}`);
  return `${payload}.${signature}`;
}

function buildAdminCookie(value, maxAge) {
  return `__Host-airtext_admin=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

function parseCookies(header) {
  const output = Object.create(null);
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    output[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return output;
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function formatServerDuration(seconds) {
  const minutes = Math.round(Number(seconds) / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function isExpired(item) {
  return !item.expiresAt || Number(item.expiresAt) <= Date.now();
}

async function getRoomId(request, secret) {
  const ip = getClientIp(request);
  const digest = await hmacHex(secret, `room:${ip}`);
  return digest.slice(0, 40);
}

async function getClientIpHash(request, secret) {
  const ip = getClientIp(request);
  const digest = await hmacHex(secret, `client:${ip}`);
  return digest.slice(0, 32);
}

function getClientIp(request) {
  const cloudflareIp = request.headers.get("CF-Connecting-IP");
  if (cloudflareIp) return cloudflareIp.trim();

  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) return forwarded.split(",")[0].trim();

  // This fallback is mainly for dashboard preview/testing.
  return "preview-client";
}

async function enforceCooldown(kv, key, cooldownSeconds) {
  const now = Date.now();
  const previousRaw = await kv.get(key);
  const previous = Number(previousRaw || 0);
  const elapsedMs = now - previous;
  const cooldownMs = cooldownSeconds * 1000;

  if (previous > 0 && elapsedMs < cooldownMs) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((cooldownMs - elapsedMs) / 1000)),
    };
  }

  try {
    await kv.put(key, String(now), { expirationTtl: 60 });
  } catch (error) {
    // A concurrent write to the same KV rate key may be limited. Treat it as a cooldown.
    console.warn("Cooldown write warning", error);
    return { allowed: false, retryAfter: cooldownSeconds };
  }

  return { allowed: true, retryAfter: 0 };
}

async function createUniqueShareCode(kv) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    let code = "";
    const bytes = crypto.getRandomValues(new Uint8Array(CONFIG.SHARE_CODE_LENGTH));
    for (const byte of bytes) code += alphabet[byte % alphabet.length];

    const existing = await kv.get(`code:${code}`);
    if (!existing) return code;
  }

  throw new Error("Unable to generate a unique share code.");
}

async function hashPin(secret, salt, pin) {
  return hmacHex(secret, `pin:${salt}:${pin}`);
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(String(message)),
  );

  return bytesToHex(new Uint8Array(signature));
}

function bytesToHex(bytes) {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

function constantTimeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

function randomBase64Url(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeTitle(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeShareCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

function normalizePath(pathname) {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

async function readJsonBody(request, maxCharacters) {
  let raw;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: jsonError("Unable to read request body.", 400, "INVALID_BODY") };
  }

  if (raw.length > maxCharacters) {
    return { ok: false, response: jsonError("Request body is too large.", 413, "BODY_TOO_LARGE") };
  }

  try {
    const data = raw ? JSON.parse(raw) : {};
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid object");
    return { ok: true, data };
  } catch {
    return { ok: false, response: jsonError("Request body must be valid JSON.", 400, "INVALID_JSON") };
  }
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function jsonError(message, status = 400, code = "ERROR", extraHeaders = {}) {
  return jsonResponse({ ok: false, error: message, code }, status, extraHeaders);
}

/* -------------------------------------------------------------------------- */
/* D1 data layer                                                               */
/* -------------------------------------------------------------------------- */

async function ensureD1Schema(env) {
  if (!databaseSchemaPromise) {
    databaseSchemaPromise = (async () => {
      await env.DB.batch([
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS site_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          data TEXT NOT NULL,
          updated_at INTEGER NOT NULL
          )
        `),
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          locked INTEGER NOT NULL DEFAULT 0,
          pin_salt TEXT,
          pin_hash TEXT,
          code TEXT NOT NULL UNIQUE,
          delete_token_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
          )
        `),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_notes_code ON notes(code)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_notes_expires ON notes(expires_at)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC)"),
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS network_notes (
          room_id TEXT NOT NULL,
          note_id TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('mine', 'received')),
          added_at INTEGER NOT NULL,
          PRIMARY KEY (room_id, note_id),
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
          )
        `),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_network_notes_room ON network_notes(room_id, added_at DESC)"),
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL,
          title TEXT NOT NULL,
          filename TEXT NOT NULL,
          mime TEXT NOT NULL DEFAULT 'application/octet-stream',
          size_bytes INTEGER NOT NULL,
          r2_key TEXT NOT NULL,
          locked INTEGER NOT NULL DEFAULT 0,
          pin_salt TEXT,
          pin_hash TEXT,
          code TEXT NOT NULL UNIQUE,
          delete_token_hash TEXT NOT NULL,
          download_count INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
          )
        `),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_files_code ON files(code)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_files_expires ON files(expires_at)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_files_created ON files(created_at DESC)"),
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS network_files (
          room_id TEXT NOT NULL,
          file_id TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('mine', 'received')),
          added_at INTEGER NOT NULL,
          PRIMARY KEY (room_id, file_id),
          FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
          )
        `),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_network_files_room ON network_files(room_id, added_at DESC)"),
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS feedback (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          message TEXT NOT NULL,
          email TEXT NOT NULL DEFAULT '',
          rating INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'new',
          created_at INTEGER NOT NULL,
          updated_at INTEGER
          )
        `),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status)"),
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS analytics (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          at INTEGER NOT NULL,
          date TEXT NOT NULL,
          network TEXT NOT NULL,
          device TEXT NOT NULL,
          via TEXT NOT NULL,
          locked INTEGER NOT NULL DEFAULT 0,
          category TEXT NOT NULL DEFAULT '',
          actor TEXT NOT NULL DEFAULT ''
          )
        `),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics(date)"),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics(type)"),
        env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          expires_at INTEGER NOT NULL
          )
        `),
        env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at)"),
      ]);
      await env.DB.prepare(
        "INSERT OR IGNORE INTO site_settings (id, data, updated_at) VALUES (1, ?, ?)",
      ).bind(JSON.stringify(DEFAULT_SETTINGS), Date.now()).run();
    })();
  }
  try {
    await databaseSchemaPromise;
  } catch (error) {
    databaseSchemaPromise = null;
    throw error;
  }
}

async function maybeCleanupD1(env) {
  const now = Date.now();
  if (now - lastCleanupAt < 30 * 60 * 1000) return;
  lastCleanupAt = now;
  try {
    await purgeExpiredFiles(env, now);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM notes WHERE expires_at <= ?").bind(now),
      env.DB.prepare("DELETE FROM analytics WHERE at <= ?").bind(now - CONFIG.ANALYTICS_RETENTION_SECONDS * 1000),
      env.DB.prepare("DELETE FROM feedback WHERE created_at <= ?").bind(now - CONFIG.FEEDBACK_RETENTION_SECONDS * 1000),
      env.DB.prepare("DELETE FROM rate_limits WHERE expires_at <= ?").bind(now),
    ]);
  } catch (error) {
    console.warn("D1 cleanup skipped", error);
  }
}

async function purgeExpiredFiles(env, now) {
  try {
    const expired = await env.DB.prepare(
      "SELECT id, r2_key FROM files WHERE expires_at <= ? LIMIT 200",
    ).bind(now).all();
    const rows = expired.results || [];
    if (!rows.length) return;
    if (env.FILES_BUCKET) {
      const keys = rows.map((row) => String(row.r2_key)).filter(Boolean);
      try {
        await env.FILES_BUCKET.delete(keys);
      } catch (error) {
        console.warn("R2 cleanup skipped for some keys", error);
      }
    }
    await env.DB.prepare(
      `DELETE FROM files WHERE id IN (${rows.map(() => "?").join(",")})`,
    ).bind(...rows.map((row) => row.id)).run();
  } catch (error) {
    console.warn("File cleanup skipped", error);
  }
}

function d1RowToItem(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    roomId: String(row.room_id || ""),
    title: String(row.title || "Untitled"),
    text: String(row.body || ""),
    locked: Boolean(row.locked),
    pinSalt: row.pin_salt ? String(row.pin_salt) : null,
    pinHash: row.pin_hash ? String(row.pin_hash) : null,
    code: String(row.code || ""),
    deleteTokenHash: String(row.delete_token_hash || ""),
    createdAt: Number(row.created_at || 0),
    expiresAt: Number(row.expires_at || 0),
  };
}

async function d1GetItemById(env, itemId) {
  const row = await env.DB.prepare("SELECT * FROM notes WHERE id = ? AND expires_at > ?")
    .bind(itemId, Date.now()).first();
  return d1RowToItem(row);
}

async function d1GetItemByCode(env, rawCode) {
  const code = normalizeShareCode(rawCode);
  const row = await env.DB.prepare("SELECT * FROM notes WHERE code = ? AND expires_at > ?")
    .bind(code, Date.now()).first();
  return d1RowToItem(row);
}

async function d1AddItemToRoom(env, item, roomId, source) {
  if (!item || isExpired(item)) return;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO network_notes (room_id, note_id, source, added_at) VALUES (?, ?, ?, ?)",
  ).bind(roomId, item.id, source === "received" ? "received" : "mine", Date.now()).run();
}

async function d1HandleListLocalItems(request, env) {
  const settings = await getSiteSettings(env);
  const roomId = await getRoomId(request, env.APP_SECRET);
  const result = await env.DB.prepare(`
    SELECT n.id, n.title, n.locked, n.code, n.created_at, n.expires_at,
           nn.added_at, nn.source
    FROM network_notes nn
    JOIN notes n ON n.id = nn.note_id
    WHERE nn.room_id = ? AND n.expires_at > ?
    ORDER BY nn.added_at DESC
    LIMIT ?
  `).bind(roomId, Date.now(), settings.maxLocalItems).all();

  return jsonResponse({
    ok: true,
    items: (result.results || []).map((row) => ({
      id: String(row.id),
      title: String(row.title || "Untitled"),
      locked: Boolean(row.locked),
      code: String(row.code || ""),
      createdAt: Number(row.created_at || 0),
      addedAt: Number(row.added_at || row.created_at || 0),
      expiresAt: Number(row.expires_at || 0),
      source: row.source === "received" ? "received" : "mine",
    })),
    expiresAfterSeconds: settings.ttlSeconds,
    networkNotice: "The available board is grouped by a private hash of the public IP address visible to Cloudflare.",
  });
}

async function d1HandleCreateItem(request, env, url) {
  const settings = await getSiteSettings(env);
  if (settings.maintenanceMode || !settings.notesEnabled || !settings.createSectionEnabled) {
    return jsonError("New notes are temporarily unavailable.", 503, "NOTES_DISABLED");
  }

  const body = await readJsonBody(request, Math.max(24_000, settings.maxTextLength + 2_000));
  if (!body.ok) return body.response;
  const title = normalizeTitle(body.data.title);
  const text = normalizeText(body.data.text);
  const wantsLock = settings.pinEnabled && Boolean(body.data.locked);
  const pin = typeof body.data.pin === "string" ? body.data.pin.trim() : "";

  if (!title) return jsonError("Please enter a title.", 400, "TITLE_REQUIRED");
  if (title.length > settings.maxTitleLength) {
    return jsonError(`Title must be ${settings.maxTitleLength} characters or fewer.`, 400, "TITLE_TOO_LONG");
  }
  if (!text) return jsonError("Please enter text to share.", 400, "TEXT_REQUIRED");
  if (text.length > settings.maxTextLength) {
    return jsonError(`Text must be ${settings.maxTextLength.toLocaleString()} characters or fewer.`, 400, "TEXT_TOO_LONG");
  }
  if (wantsLock && (pin.length < CONFIG.MIN_PIN_LENGTH || pin.length > CONFIG.MAX_PIN_LENGTH)) {
    return jsonError(
      `PIN must be between ${CONFIG.MIN_PIN_LENGTH} and ${CONFIG.MAX_PIN_LENGTH} characters.`,
      400,
      "INVALID_PIN_LENGTH",
    );
  }

  const clientHash = await getClientIpHash(request, env.APP_SECRET);
  const rateResult = await d1EnforceCooldown(env, `create:${clientHash}`, settings.createCooldownSeconds);
  if (!rateResult.allowed) {
    return jsonError(
      `Please wait ${rateResult.retryAfter} second${rateResult.retryAfter === 1 ? "" : "s"} before creating another note.`,
      429,
      "CREATE_RATE_LIMIT",
      { "retry-after": String(rateResult.retryAfter) },
    );
  }

  const roomId = await getRoomId(request, env.APP_SECRET);
  const id = randomBase64Url(16);
  const code = await d1CreateUniqueShareCode(env);
  const deleteToken = randomBase64Url(32);
  const deleteTokenHash = await hmacHex(env.APP_SECRET, `delete:${deleteToken}`);
  const createdAt = Date.now();
  const expiresAt = createdAt + settings.ttlSeconds * 1000;
  let pinSalt = null;
  let pinHash = null;
  if (wantsLock) {
    pinSalt = randomBase64Url(18);
    pinHash = await hashPin(env.APP_SECRET, pinSalt, pin);
  }

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO notes (
        id, room_id, title, body, locked, pin_salt, pin_hash, code,
        delete_token_hash, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, roomId, title, text, wantsLock ? 1 : 0, pinSalt, pinHash, code,
      deleteTokenHash, createdAt, expiresAt,
    ),
    env.DB.prepare(
      "INSERT INTO network_notes (room_id, note_id, source, added_at) VALUES (?, ?, 'mine', ?)",
    ).bind(roomId, id, createdAt),
  ]);

  await d1RecordEvent(env, request, "note_created", { locked: wantsLock });
  return jsonResponse({
    ok: true,
    item: {
      id, title, locked: wantsLock, code, createdAt, addedAt: createdAt, expiresAt, source: "mine",
    },
    deleteToken,
    shareUrl: `${url.origin}/s/${code}`,
    message: `Note created. It will expire automatically in ${formatServerDuration(settings.ttlSeconds)}.`,
  }, 201);
}

async function d1HandleGetLocalItem(request, env, itemId) {
  const roomId = await getRoomId(request, env.APP_SECRET);
  const row = await env.DB.prepare(`
    SELECT n.* FROM notes n
    JOIN network_notes nn ON nn.note_id = n.id
    WHERE n.id = ? AND nn.room_id = ? AND n.expires_at > ?
  `).bind(itemId, roomId, Date.now()).first();
  const item = d1RowToItem(row);
  if (!item) return jsonError("This note has expired or is not available on this network.", 404, "NOT_FOUND");
  await d1RecordEvent(env, request, "note_opened", { via: "network" });
  return jsonResponse(publicItemPayload(item, !item.locked));
}

async function d1HandleUnlockLocalItem(request, env, itemId) {
  const roomId = await getRoomId(request, env.APP_SECRET);
  const row = await env.DB.prepare(`
    SELECT n.* FROM notes n
    JOIN network_notes nn ON nn.note_id = n.id
    WHERE n.id = ? AND nn.room_id = ? AND n.expires_at > ?
  `).bind(itemId, roomId, Date.now()).first();
  const item = d1RowToItem(row);
  if (!item) return jsonError("This note has expired or is not available on this network.", 404, "NOT_FOUND");
  const result = await d1VerifyPin(request, env, item);
  if (!result.ok) return result.response;
  await d1RecordEvent(env, request, "pin_unlocked", { via: "network" });
  return jsonResponse(publicItemPayload(item, true));
}

async function d1HandleGetSharedItem(request, env, rawCode, url) {
  const settings = await getSiteSettings(env);
  const item = await d1GetItemByCode(env, rawCode);
  if (!item) return jsonError("This share code is invalid or has expired.", 404, "CODE_NOT_FOUND");
  const via = normalizeAccessMethod(url.searchParams.get("via"));
  if (!item.locked && settings.crossNetworkAddEnabled) {
    const roomId = await getRoomId(request, env.APP_SECRET);
    await d1AddItemToRoom(env, item, roomId, constantTimeEqual(roomId, item.roomId) ? "mine" : "received");
  }
  await d1RecordEvent(env, request, "shared_note_opened", { via, locked: item.locked });
  return jsonResponse(publicItemPayload(item, !item.locked));
}

async function d1HandleUnlockSharedItem(request, env, rawCode, url) {
  const settings = await getSiteSettings(env);
  const item = await d1GetItemByCode(env, rawCode);
  if (!item) return jsonError("This share code is invalid or has expired.", 404, "CODE_NOT_FOUND");
  const result = await d1VerifyPin(request, env, item);
  if (!result.ok) return result.response;
  if (settings.crossNetworkAddEnabled) {
    const roomId = await getRoomId(request, env.APP_SECRET);
    await d1AddItemToRoom(env, item, roomId, constantTimeEqual(roomId, item.roomId) ? "mine" : "received");
  }
  await d1RecordEvent(env, request, "pin_unlocked", {
    via: normalizeAccessMethod(url.searchParams.get("via")),
  });
  return jsonResponse(publicItemPayload(item, true));
}

async function d1VerifyPin(request, env, item) {
  if (!item.locked) return { ok: true };
  const settings = await getSiteSettings(env);
  const body = await readJsonBody(request, 2_000);
  if (!body.ok) return { ok: false, response: body.response };
  const pin = typeof body.data.pin === "string" ? body.data.pin.trim() : "";
  if (!pin) return { ok: false, response: jsonError("PIN is required.", 400, "PIN_REQUIRED") };

  const clientHash = await getClientIpHash(request, env.APP_SECRET);
  const rateResult = await d1EnforceCooldown(
    env,
    `unlock:${clientHash}:${item.id}`,
    settings.unlockCooldownSeconds,
  );
  if (!rateResult.allowed) {
    return { ok: false, response: jsonError(
      `Please wait ${rateResult.retryAfter} second${rateResult.retryAfter === 1 ? "" : "s"} and try again.`,
      429,
      "UNLOCK_RATE_LIMIT",
      { "retry-after": String(rateResult.retryAfter) },
    ) };
  }
  const suppliedHash = await hashPin(env.APP_SECRET, item.pinSalt, pin);
  if (!constantTimeEqual(suppliedHash, item.pinHash)) {
    await d1RecordEvent(env, request, "pin_failed");
    return { ok: false, response: jsonError("Incorrect PIN.", 401, "WRONG_PIN") };
  }
  return { ok: true };
}

async function d1HandleDeleteItem(request, env, itemId) {
  const item = await d1GetItemById(env, itemId);
  if (!item) return jsonError("This note has already expired or does not exist.", 404, "NOT_FOUND");
  const body = await readJsonBody(request, 4_000);
  if (!body.ok) return body.response;
  const token = typeof body.data.deleteToken === "string" ? body.data.deleteToken : "";
  if (!token) return jsonError("Delete token is required.", 401, "DELETE_TOKEN_REQUIRED");
  const suppliedHash = await hmacHex(env.APP_SECRET, `delete:${token}`);
  if (!constantTimeEqual(suppliedHash, item.deleteTokenHash)) {
    return jsonError("You can delete this note only from the browser that created it.", 403, "INVALID_DELETE_TOKEN");
  }
  await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(item.id).run();
  await d1RecordEvent(env, request, "note_deleted", { by: "creator" });
  return jsonResponse({ ok: true, message: "Note deleted." });
}

/* -------------------------------------------------------------------------- */
/* File sharing (D1 metadata + R2 storage) — temporary, no account required   */
/* -------------------------------------------------------------------------- */

function d1RowToFile(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    roomId: String(row.room_id || ""),
    title: String(row.title || "Untitled"),
    filename: String(row.filename || "file"),
    mime: String(row.mime || "application/octet-stream"),
    sizeBytes: Number(row.size_bytes || 0),
    r2Key: String(row.r2_key || ""),
    locked: Boolean(row.locked),
    pinSalt: row.pin_salt ? String(row.pin_salt) : null,
    pinHash: row.pin_hash ? String(row.pin_hash) : null,
    code: String(row.code || ""),
    deleteTokenHash: String(row.delete_token_hash || ""),
    downloadCount: Number(row.download_count || 0),
    createdAt: Number(row.created_at || 0),
    expiresAt: Number(row.expires_at || 0),
  };
}

async function d1GetFileById(env, fileId) {
  const row = await env.DB.prepare("SELECT * FROM files WHERE id = ? AND expires_at > ?")
    .bind(fileId, Date.now()).first();
  return d1RowToFile(row);
}

async function d1GetFileByCode(env, rawCode) {
  const code = normalizeShareCode(rawCode);
  const row = await env.DB.prepare("SELECT * FROM files WHERE code = ? AND expires_at > ?")
    .bind(code, Date.now()).first();
  return d1RowToFile(row);
}

async function d1AddFileToRoom(env, file, roomId, source) {
  if (!file || isExpired(file)) return;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO network_files (room_id, file_id, source, added_at) VALUES (?, ?, ?, ?)",
  ).bind(roomId, file.id, source === "received" ? "received" : "mine", Date.now()).run();
}

function getFileExtension(filename) {
  const clean = String(filename || "").trim().toLowerCase();
  const dot = clean.lastIndexOf(".");
  return dot >= 0 && dot < clean.length - 1 ? clean.slice(dot + 1) : "";
}

function parseExtensionList(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
}

function isExtensionAllowed(settings, filename) {
  const ext = getFileExtension(filename);
  const blocked = parseExtensionList(settings.blockedFileExtensions);
  if (ext && blocked.includes(ext)) return false;
  const allowed = parseExtensionList(settings.allowedFileExtensions);
  if (allowed.length && !allowed.includes(ext)) return false;
  return true;
}

async function getTotalFileStorageBytes(env) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM files WHERE expires_at > ?",
  ).bind(Date.now()).first();
  return Number((row && row.total) || 0);
}

async function createFileDownloadToken(secret, fileId, expiresAt) {
  const signature = await hmacHex(secret, `file-download:${fileId}:${expiresAt}`);
  return `${expiresAt}.${signature}`;
}

async function verifyFileDownloadToken(secret, fileId, token) {
  const raw = String(token || "");
  const dot = raw.indexOf(".");
  if (dot <= 0) return false;
  const expiresAt = Number(raw.slice(0, dot));
  const signature = raw.slice(dot + 1);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = await hmacHex(secret, `file-download:${fileId}:${expiresAt}`);
  return constantTimeEqual(signature, expected);
}

async function publicFilePayload(env, file, includeDownload) {
  let downloadUrl = null;
  if (includeDownload) {
    const tokenExpiresAt = Date.now() + 5 * 60 * 1000;
    const token = await createFileDownloadToken(env.APP_SECRET, file.id, tokenExpiresAt);
    downloadUrl = `/api/file/${file.id}/download?token=${encodeURIComponent(token)}`;
  }
  return {
    ok: true,
    file: {
      id: file.id,
      title: file.title,
      filename: file.filename,
      mime: file.mime,
      sizeBytes: file.sizeBytes,
      locked: Boolean(file.locked),
      code: file.code,
      downloadCount: file.downloadCount,
      createdAt: Number(file.createdAt),
      expiresAt: Number(file.expiresAt),
      ...(downloadUrl ? { downloadUrl } : {}),
    },
  };
}

async function d1CreateUniqueFileShareCode(env) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let code = "";
    const bytes = crypto.getRandomValues(new Uint8Array(CONFIG.SHARE_CODE_LENGTH));
    for (const byte of bytes) code += alphabet[byte % alphabet.length];
    const existing = await env.DB.prepare("SELECT 1 AS found FROM files WHERE code = ?").bind(code).first();
    if (!existing) return code;
  }
  throw new Error("Unable to generate a unique file share code.");
}

async function d1VerifyFilePin(request, env, file) {
  if (!file.locked) return { ok: true };
  const settings = await getSiteSettings(env);
  const body = await readJsonBody(request, 2_000);
  if (!body.ok) return { ok: false, response: body.response };
  const pin = typeof body.data.pin === "string" ? body.data.pin.trim() : "";
  if (!pin) return { ok: false, response: jsonError("PIN is required.", 400, "PIN_REQUIRED") };

  const clientHash = await getClientIpHash(request, env.APP_SECRET);
  const rateResult = await d1EnforceCooldown(
    env,
    `unlock-file:${clientHash}:${file.id}`,
    settings.unlockCooldownSeconds,
  );
  if (!rateResult.allowed) {
    return { ok: false, response: jsonError(
      `Please wait ${rateResult.retryAfter} second${rateResult.retryAfter === 1 ? "" : "s"} and try again.`,
      429,
      "UNLOCK_RATE_LIMIT",
      { "retry-after": String(rateResult.retryAfter) },
    ) };
  }
  const suppliedHash = await hashPin(env.APP_SECRET, file.pinSalt, pin);
  if (!constantTimeEqual(suppliedHash, file.pinHash)) {
    await d1RecordEvent(env, request, "file_pin_failed");
    return { ok: false, response: jsonError("Incorrect PIN.", 401, "WRONG_PIN") };
  }
  return { ok: true };
}

async function d1HandleListLocalFiles(request, env) {
  const settings = await getSiteSettings(env);
  const roomId = await getRoomId(request, env.APP_SECRET);
  const result = await env.DB.prepare(`
    SELECT f.id, f.title, f.filename, f.mime, f.size_bytes, f.locked, f.code,
           f.created_at, f.expires_at, nf.added_at, nf.source
    FROM network_files nf
    JOIN files f ON f.id = nf.file_id
    WHERE nf.room_id = ? AND f.expires_at > ?
    ORDER BY nf.added_at DESC
    LIMIT ?
  `).bind(roomId, Date.now(), settings.maxActiveFiles).all();

  return jsonResponse({
    ok: true,
    files: (result.results || []).map((row) => ({
      id: String(row.id),
      title: String(row.title || "Untitled"),
      filename: String(row.filename || "file"),
      mime: String(row.mime || "application/octet-stream"),
      sizeBytes: Number(row.size_bytes || 0),
      locked: Boolean(row.locked),
      code: String(row.code || ""),
      createdAt: Number(row.created_at || 0),
      addedAt: Number(row.added_at || row.created_at || 0),
      expiresAt: Number(row.expires_at || 0),
      source: row.source === "received" ? "received" : "mine",
    })),
    expiresAfterSeconds: settings.fileTtlSeconds,
  });
}

async function d1HandleCreateFile(request, env, url) {
  const settings = await getSiteSettings(env);
  if (settings.maintenanceMode || !settings.fileSharingEnabled) {
    return jsonError("File sharing is temporarily unavailable.", 503, "FILES_DISABLED");
  }
  if (!env.FILES_BUCKET) {
    return jsonError(
      "File sharing is not configured. Add an R2 bucket binding named FILES_BUCKET in Cloudflare.",
      503,
      "R2_NOT_CONFIGURED",
    );
  }

  const maxBytes = settings.maxFileSizeMB * 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength && contentLength > maxBytes + 200_000) {
    return jsonError(`Files must be ${settings.maxFileSizeMB}MB or smaller.`, 413, "FILE_TOO_LARGE");
  }

  let form;
  try {
    form = await request.formData();
  } catch (error) {
    return jsonError("Could not read the upload. Please try again.", 400, "INVALID_UPLOAD");
  }

  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return jsonError("Please choose a file to share.", 400, "FILE_REQUIRED");
  }
  if (file.size > maxBytes) {
    return jsonError(`Files must be ${settings.maxFileSizeMB}MB or smaller.`, 413, "FILE_TOO_LARGE");
  }
  if (!file.size) {
    return jsonError("This file is empty.", 400, "FILE_EMPTY");
  }
  if (!isExtensionAllowed(settings, file.name)) {
    return jsonError("This file type is not allowed.", 400, "FILE_TYPE_BLOCKED");
  }

  const totalStored = await getTotalFileStorageBytes(env);
  if (totalStored + file.size > settings.maxTotalStorageMB * 1024 * 1024) {
    return jsonError("The site-wide storage limit has been reached. Please try again later.", 507, "STORAGE_LIMIT");
  }

  const titleInput = typeof form.get("title") === "string" ? form.get("title") : "";
  const title = normalizeTitle(titleInput) || String(file.name || "Untitled file").slice(0, settings.maxTitleLength);
  const wantsLock = settings.pinEnabled && form.get("locked") === "1";
  const pin = typeof form.get("pin") === "string" ? form.get("pin").trim() : "";
  if (title.length > settings.maxTitleLength) {
    return jsonError(`Title must be ${settings.maxTitleLength} characters or fewer.`, 400, "TITLE_TOO_LONG");
  }
  if (wantsLock && (pin.length < CONFIG.MIN_PIN_LENGTH || pin.length > CONFIG.MAX_PIN_LENGTH)) {
    return jsonError(
      `PIN must be between ${CONFIG.MIN_PIN_LENGTH} and ${CONFIG.MAX_PIN_LENGTH} characters.`,
      400,
      "INVALID_PIN_LENGTH",
    );
  }

  const clientHash = await getClientIpHash(request, env.APP_SECRET);
  const rateResult = await d1EnforceCooldown(env, `create-file:${clientHash}`, settings.fileUploadCooldownSeconds);
  if (!rateResult.allowed) {
    return jsonError(
      `Please wait ${rateResult.retryAfter} second${rateResult.retryAfter === 1 ? "" : "s"} before uploading another file.`,
      429,
      "CREATE_RATE_LIMIT",
      { "retry-after": String(rateResult.retryAfter) },
    );
  }

  const roomId = await getRoomId(request, env.APP_SECRET);
  const id = randomBase64Url(16);
  const code = await d1CreateUniqueFileShareCode(env);
  const deleteToken = randomBase64Url(32);
  const deleteTokenHash = await hmacHex(env.APP_SECRET, `delete:${deleteToken}`);
  const createdAt = Date.now();
  const expiresAt = createdAt + settings.fileTtlSeconds * 1000;
  const r2Key = `files/${id}`;
  let pinSalt = null;
  let pinHash = null;
  if (wantsLock) {
    pinSalt = randomBase64Url(18);
    pinHash = await hashPin(env.APP_SECRET, pinSalt, pin);
  }

  try {
    await env.FILES_BUCKET.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
  } catch (error) {
    console.error("R2 upload failed", error);
    return jsonError("Could not store the file. Please try again.", 502, "STORAGE_WRITE_FAILED");
  }

  const filename = String(file.name || "file").slice(0, 255);
  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO files (
          id, room_id, title, filename, mime, size_bytes, r2_key, locked,
          pin_salt, pin_hash, code, delete_token_hash, download_count, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).bind(
        id, roomId, title, filename, file.type || "application/octet-stream",
        file.size, r2Key, wantsLock ? 1 : 0, pinSalt, pinHash, code, deleteTokenHash, createdAt, expiresAt,
      ),
      env.DB.prepare(
        "INSERT INTO network_files (room_id, file_id, source, added_at) VALUES (?, ?, 'mine', ?)",
      ).bind(roomId, id, createdAt),
    ]);
  } catch (error) {
    await env.FILES_BUCKET.delete(r2Key).catch(() => {});
    console.error("File metadata write failed", error);
    return jsonError("Could not save the file record. Please try again.", 500, "DB_WRITE_FAILED");
  }

  await d1RecordEvent(env, request, "file_created", { locked: wantsLock });
  return jsonResponse({
    ok: true,
    file: {
      id, title, filename, mime: file.type || "application/octet-stream", sizeBytes: file.size,
      locked: wantsLock, code, createdAt, addedAt: createdAt, expiresAt, source: "mine",
    },
    deleteToken,
    shareUrl: `${url.origin}/f/${code}`,
    message: `File uploaded. It will expire automatically in ${formatServerDuration(settings.fileTtlSeconds)}.`,
  }, 201);
}

async function d1HandleGetLocalFile(request, env, fileId) {
  const roomId = await getRoomId(request, env.APP_SECRET);
  const row = await env.DB.prepare(`
    SELECT f.* FROM files f
    JOIN network_files nf ON nf.file_id = f.id
    WHERE f.id = ? AND nf.room_id = ? AND f.expires_at > ?
  `).bind(fileId, roomId, Date.now()).first();
  const file = d1RowToFile(row);
  if (!file) return jsonError("This file has expired or is not available on this network.", 404, "NOT_FOUND");
  await d1RecordEvent(env, request, "file_opened", { via: "network" });
  return jsonResponse(await publicFilePayload(env, file, !file.locked));
}

async function d1HandleUnlockLocalFile(request, env, fileId) {
  const roomId = await getRoomId(request, env.APP_SECRET);
  const row = await env.DB.prepare(`
    SELECT f.* FROM files f
    JOIN network_files nf ON nf.file_id = f.id
    WHERE f.id = ? AND nf.room_id = ? AND f.expires_at > ?
  `).bind(fileId, roomId, Date.now()).first();
  const file = d1RowToFile(row);
  if (!file) return jsonError("This file has expired or is not available on this network.", 404, "NOT_FOUND");
  const result = await d1VerifyFilePin(request, env, file);
  if (!result.ok) return result.response;
  await d1RecordEvent(env, request, "file_pin_unlocked", { via: "network" });
  return jsonResponse(await publicFilePayload(env, file, true));
}

async function d1HandleGetSharedFile(request, env, rawCode, url) {
  const settings = await getSiteSettings(env);
  const file = await d1GetFileByCode(env, rawCode);
  if (!file) return jsonError("This share code is invalid or has expired.", 404, "CODE_NOT_FOUND");
  const via = normalizeAccessMethod(url.searchParams.get("via"));
  if (!file.locked && settings.crossNetworkAddEnabled) {
    const roomId = await getRoomId(request, env.APP_SECRET);
    await d1AddFileToRoom(env, file, roomId, constantTimeEqual(roomId, file.roomId) ? "mine" : "received");
  }
  await d1RecordEvent(env, request, "shared_file_opened", { via, locked: file.locked });
  return jsonResponse(await publicFilePayload(env, file, !file.locked));
}

async function d1HandleUnlockSharedFile(request, env, rawCode, url) {
  const settings = await getSiteSettings(env);
  const file = await d1GetFileByCode(env, rawCode);
  if (!file) return jsonError("This share code is invalid or has expired.", 404, "CODE_NOT_FOUND");
  const result = await d1VerifyFilePin(request, env, file);
  if (!result.ok) return result.response;
  if (settings.crossNetworkAddEnabled) {
    const roomId = await getRoomId(request, env.APP_SECRET);
    await d1AddFileToRoom(env, file, roomId, constantTimeEqual(roomId, file.roomId) ? "mine" : "received");
  }
  await d1RecordEvent(env, request, "file_pin_unlocked", {
    via: normalizeAccessMethod(url.searchParams.get("via")),
  });
  return jsonResponse(await publicFilePayload(env, file, true));
}

async function d1HandleDownloadFile(request, env, fileId, url) {
  if (!env.FILES_BUCKET) {
    return jsonError("File sharing is not configured.", 503, "R2_NOT_CONFIGURED");
  }
  const file = await d1GetFileById(env, fileId);
  if (!file) return jsonError("This file has expired or does not exist.", 404, "NOT_FOUND");
  const token = url.searchParams.get("token") || "";
  const valid = await verifyFileDownloadToken(env.APP_SECRET, file.id, token);
  if (!valid) return jsonError("This download link is invalid or has expired. Reopen the file to try again.", 403, "INVALID_DOWNLOAD_TOKEN");

  const object = await env.FILES_BUCKET.get(file.r2Key);
  if (!object) return jsonError("The file could not be found in storage.", 404, "STORAGE_MISSING");

  await env.DB.prepare("UPDATE files SET download_count = download_count + 1 WHERE id = ?").bind(file.id).run();
  await d1RecordEvent(env, request, "file_downloaded");

  const safeName = file.filename.replace(/["\r\n]/g, "");
  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": file.mime || "application/octet-stream",
      "content-disposition": `attachment; filename="${safeName}"`,
      "cache-control": "no-store",
      "content-length": String(file.sizeBytes),
    },
  });
}

async function d1HandleDeleteFile(request, env, fileId) {
  const file = await d1GetFileById(env, fileId);
  if (!file) return jsonError("This file has already expired or does not exist.", 404, "NOT_FOUND");
  const body = await readJsonBody(request, 4_000);
  if (!body.ok) return body.response;
  const token = typeof body.data.deleteToken === "string" ? body.data.deleteToken : "";
  if (!token) return jsonError("Delete token is required.", 401, "DELETE_TOKEN_REQUIRED");
  const suppliedHash = await hmacHex(env.APP_SECRET, `delete:${token}`);
  if (!constantTimeEqual(suppliedHash, file.deleteTokenHash)) {
    return jsonError("You can delete this file only from the browser that created it.", 403, "INVALID_DELETE_TOKEN");
  }
  await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(file.id).run();
  if (env.FILES_BUCKET) {
    await env.FILES_BUCKET.delete(file.r2Key).catch(() => {});
  }
  await d1RecordEvent(env, request, "file_deleted", { by: "creator" });
  return jsonResponse({ ok: true, message: "File deleted." });
}

async function d1HandleSubmitFeedback(request, env) {
  const settings = await getSiteSettings(env);
  if (!settings.feedbackEnabled) {
    return jsonError("Feedback is currently disabled.", 403, "FEEDBACK_DISABLED");
  }
  const body = await readJsonBody(request, 6_000);
  if (!body.ok) return body.response;
  const allowedCategories = ["bug", "suggestion", "design", "other"];
  const category = allowedCategories.includes(body.data.category) ? body.data.category : "other";
  const message = typeof body.data.message === "string" ? body.data.message.trim() : "";
  const email = typeof body.data.email === "string" ? body.data.email.trim().slice(0, 200) : "";
  const rating = Math.max(0, Math.min(5, Number(body.data.rating || 0)));
  if (message.length < 5 || message.length > 2_000) {
    return jsonError("Feedback must be between 5 and 2,000 characters.", 400, "INVALID_FEEDBACK");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("Enter a valid email address or leave it empty.", 400, "INVALID_EMAIL");
  }
  const clientHash = await getClientIpHash(request, env.APP_SECRET);
  const cooldown = await d1EnforceCooldown(env, `feedback:${clientHash}`, 60);
  if (!cooldown.allowed) {
    return jsonError(`Please wait ${cooldown.retryAfter} seconds before submitting again.`, 429, "FEEDBACK_RATE_LIMIT");
  }
  const id = randomBase64Url(12);
  const createdAt = Date.now();
  await env.DB.prepare(`
    INSERT INTO feedback (id, category, message, email, rating, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'new', ?)
  `).bind(id, category, message, email, Number.isFinite(rating) ? rating : 0, createdAt).run();
  await d1RecordEvent(env, request, "feedback_submitted", { category });
  return jsonResponse({ ok: true, message: "Thank you. Your feedback has been submitted." }, 201);
}

async function d1HandleAdminLogin(request, env) {
  if (!env.ADMIN_PASSWORD || String(env.ADMIN_PASSWORD).length < 8) {
    return jsonError("Add an ADMIN_PASSWORD secret with at least 8 characters.", 503, "ADMIN_NOT_CONFIGURED");
  }
  const body = await readJsonBody(request, 2_000);
  if (!body.ok) return body.response;
  const password = typeof body.data.password === "string" ? body.data.password : "";
  const clientHash = await getClientIpHash(request, env.APP_SECRET);
  const cooldown = await d1EnforceCooldown(env, `admin:${clientHash}`, 3);
  if (!cooldown.allowed) {
    return jsonError(`Please wait ${cooldown.retryAfter} seconds and try again.`, 429, "ADMIN_RATE_LIMIT");
  }
  const supplied = await hmacHex(env.APP_SECRET, `admin-password:${password}`);
  const expected = await hmacHex(env.APP_SECRET, `admin-password:${env.ADMIN_PASSWORD}`);
  if (!constantTimeEqual(supplied, expected)) {
    await d1RecordEvent(env, request, "admin_login_failed");
    return jsonError("Incorrect administrator password.", 401, "INVALID_ADMIN_PASSWORD");
  }
  const token = await createAdminSessionToken(env.APP_SECRET);
  await d1RecordEvent(env, request, "admin_login");
  return jsonResponse(
    { ok: true, message: "Signed in." },
    200,
    { "set-cookie": buildAdminCookie(token, CONFIG.ADMIN_SESSION_SECONDS) },
  );
}

async function d1HandleAdminDashboard(request, env) {
  const authError = await requireAdmin(request, env);
  if (authError) return authError;
  const settings = await getSiteSettings(env);
  const now = Date.now();
  const startDate = new Date(now - 6 * 86_400_000).toISOString().slice(0, 10);
  const results = await env.DB.batch([
    env.DB.prepare(`
      SELECT id, title, locked, code, created_at, expires_at, substr(room_id, 1, 12) AS room_hash
      FROM notes WHERE expires_at > ? ORDER BY created_at DESC LIMIT 100
    `).bind(now),
    env.DB.prepare("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100"),
    env.DB.prepare("SELECT type, COUNT(*) AS count FROM analytics GROUP BY type"),
    env.DB.prepare("SELECT date, COUNT(*) AS count FROM analytics WHERE date >= ? GROUP BY date").bind(startDate),
    env.DB.prepare("SELECT COUNT(DISTINCT network) AS count FROM analytics"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM notes WHERE expires_at > ?").bind(now),
    env.DB.prepare(`
      SELECT id, title, filename, mime, size_bytes, locked, code, download_count, created_at, expires_at,
             substr(room_id, 1, 12) AS room_hash
      FROM files WHERE expires_at > ? ORDER BY created_at DESC LIMIT 100
    `).bind(now),
    env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM files WHERE expires_at > ?").bind(now),
  ]);
  const notesRows = results[0].results || [];
  const feedbackRows = results[1].results || [];
  const filesRows = results[6].results || [];
  const fileTotals = results[7].results?.[0] || { count: 0, bytes: 0 };
  const counts = Object.create(null);
  for (const row of results[2].results || []) counts[String(row.type)] = Number(row.count || 0);
  const chartMap = Object.create(null);
  for (const row of results[3].results || []) chartMap[String(row.date)] = Number(row.count || 0);
  const chart = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now - offset * 86_400_000).toISOString().slice(0, 10);
    chart.push({ date, count: chartMap[date] || 0 });
  }
  const notes = notesRows.map((row) => ({
    id: String(row.id),
    title: String(row.title || "Untitled"),
    locked: Boolean(row.locked),
    code: String(row.code || ""),
    createdAt: Number(row.created_at || 0),
    expiresAt: Number(row.expires_at || 0),
    roomHash: String(row.room_hash || ""),
  }));
  const feedback = feedbackRows.map((row) => ({
    id: String(row.id),
    category: String(row.category || "other"),
    message: String(row.message || ""),
    email: String(row.email || ""),
    rating: Number(row.rating || 0),
    status: String(row.status || "new"),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  }));
  const files = filesRows.map((row) => ({
    id: String(row.id),
    title: String(row.title || "Untitled"),
    filename: String(row.filename || "file"),
    mime: String(row.mime || "application/octet-stream"),
    sizeBytes: Number(row.size_bytes || 0),
    locked: Boolean(row.locked),
    code: String(row.code || ""),
    downloadCount: Number(row.download_count || 0),
    createdAt: Number(row.created_at || 0),
    expiresAt: Number(row.expires_at || 0),
    roomHash: String(row.room_hash || ""),
  }));
  return jsonResponse({
    ok: true,
    settings,
    storage: {
      primary: "D1",
      kvRoutineWrites: 0,
      filesBucketConfigured: Boolean(env.FILES_BUCKET),
      fileStorageBytes: Number(fileTotals.bytes || 0),
      fileStorageLimitBytes: settings.maxTotalStorageMB * 1024 * 1024,
    },
    stats: {
      activeNotes: Number(results[5].results?.[0]?.count || notes.length),
      createdNotes: counts.note_created || 0,
      noteOpens: (counts.note_opened || 0) + (counts.shared_note_opened || 0),
      receivedOpens: counts.shared_note_opened || 0,
      feedbackTotal: feedback.length,
      feedbackNew: feedback.filter((item) => item.status === "new").length,
      uniqueNetworks: Number(results[4].results?.[0]?.count || 0),
      pinFailures: counts.pin_failed || 0,
      activeFiles: Number(fileTotals.count || files.length),
      fileDownloads: counts.file_downloaded || 0,
    },
    eventCounts: counts,
    chart,
    notes,
    feedback,
    files,
  });
}

async function d1HandleAdminSettingsUpdate(request, env) {
  const authError = await requireAdmin(request, env, true);
  if (authError) return authError;
  const body = await readJsonBody(request, 80_000);
  if (!body.ok) return body.response;
  const current = await getSiteSettings(env);
  const settings = sanitizeSettings({ ...current, ...body.data });
  await env.DB.prepare("UPDATE site_settings SET data = ?, updated_at = ? WHERE id = 1")
    .bind(JSON.stringify(settings), Date.now()).run();
  settingsCache = settings;
  settingsCacheExpiresAt = Date.now() + 15_000;
  await d1RecordEvent(env, request, "settings_updated");
  return jsonResponse({ ok: true, settings, message: "Settings saved." });
}

async function d1HandleAdminDeleteItem(request, env, itemId) {
  const authError = await requireAdmin(request, env, true);
  if (authError) return authError;
  const item = await d1GetItemById(env, itemId);
  if (!item) return jsonError("The note has expired or does not exist.", 404, "NOT_FOUND");
  await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(item.id).run();
  await d1RecordEvent(env, request, "note_deleted", { by: "admin" });
  return jsonResponse({ ok: true, message: "Note deleted." });
}

async function d1HandleAdminDeleteFile(request, env, fileId) {
  const authError = await requireAdmin(request, env, true);
  if (authError) return authError;
  const file = await d1GetFileById(env, fileId);
  if (!file) return jsonError("The file has expired or does not exist.", 404, "NOT_FOUND");
  await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(file.id).run();
  if (env.FILES_BUCKET) {
    await env.FILES_BUCKET.delete(file.r2Key).catch(() => {});
  }
  await d1RecordEvent(env, request, "file_deleted", { by: "admin" });
  return jsonResponse({ ok: true, message: "File deleted." });
}

async function d1HandleAdminFeedbackUpdate(request, env, feedbackId) {
  const authError = await requireAdmin(request, env, true);
  if (authError) return authError;
  const body = await readJsonBody(request, 2_000);
  if (!body.ok) return body.response;
  const allowed = ["new", "reviewed", "resolved"];
  const status = allowed.includes(body.data.status) ? body.data.status : "";
  if (!status) return jsonError("Invalid feedback status.", 400, "INVALID_STATUS");
  const result = await env.DB.prepare(
    "UPDATE feedback SET status = ?, updated_at = ? WHERE id = ?",
  ).bind(status, Date.now(), feedbackId).run();
  if (!result.meta || Number(result.meta.changes || 0) < 1) {
    return jsonError("Feedback not found.", 404, "NOT_FOUND");
  }
  return jsonResponse({ ok: true, feedback: { id: feedbackId, status } });
}

async function d1HandleAdminFeedbackDelete(request, env, feedbackId) {
  const authError = await requireAdmin(request, env, true);
  if (authError) return authError;
  const result = await env.DB.prepare("DELETE FROM feedback WHERE id = ?").bind(feedbackId).run();
  if (!result.meta || Number(result.meta.changes || 0) < 1) {
    return jsonError("Feedback not found.", 404, "NOT_FOUND");
  }
  return jsonResponse({ ok: true, message: "Feedback deleted." });
}

async function d1EnforceCooldown(env, key, cooldownSeconds) {
  const now = Date.now();
  const existing = await env.DB.prepare("SELECT expires_at FROM rate_limits WHERE key = ?").bind(key).first();
  if (existing && Number(existing.expires_at) > now) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((Number(existing.expires_at) - now) / 1000)),
    };
  }
  await env.DB.prepare(`
    INSERT INTO rate_limits (key, expires_at) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET expires_at = excluded.expires_at
  `).bind(key, now + cooldownSeconds * 1000).run();
  return { allowed: true, retryAfter: 0 };
}

async function d1CreateUniqueShareCode(env) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let code = "";
    const bytes = crypto.getRandomValues(new Uint8Array(CONFIG.SHARE_CODE_LENGTH));
    for (const byte of bytes) code += alphabet[byte % alphabet.length];
    const existing = await env.DB.prepare("SELECT 1 AS found FROM notes WHERE code = ?").bind(code).first();
    if (!existing) return code;
  }
  throw new Error("Unable to generate a unique share code.");
}

async function d1RecordEvent(env, request, type, details = {}) {
  try {
    const settings = await getSiteSettings(env);
    if (!settings.analyticsEnabled) return;
    const at = Date.now();
    const date = new Date(at).toISOString().slice(0, 10);
    const network = (await hmacHex(env.APP_SECRET, `analytics:${date}:${getClientIp(request)}`)).slice(0, 18);
    await env.DB.prepare(`
      INSERT INTO analytics (
        id, type, at, date, network, device, via, locked, category, actor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      randomBase64Url(12),
      String(type).slice(0, 40),
      at,
      date,
      network,
      detectDevice(request.headers.get("user-agent")),
      normalizeAccessMethod(details.via),
      details.locked ? 1 : 0,
      typeof details.category === "string" ? details.category.slice(0, 24) : "",
      typeof details.by === "string" ? details.by.slice(0, 16) : "",
    ).run();
  } catch (error) {
    console.warn("D1 analytics write skipped", error);
  }
}

/* -------------------------------------------------------------------------- */
/* HTML                                                                        */
/* -------------------------------------------------------------------------- */

function renderAppPage(settings) {
  const replacements = {
    "__APP_NAME__": escapeHtml(settings.appName),
    "__APP_TAGLINE__": escapeHtml(settings.tagline),
    "__ANNOUNCEMENT__": escapeHtml(settings.announcement),
    "__INITIAL_SHARE_CODE__": JSON.stringify(settings.initialShareCode),
    "__INITIAL_FILE_SHARE_CODE__": JSON.stringify(settings.initialFileShareCode || ""),
    "__INITIAL_SHARE_VIA__": JSON.stringify(settings.initialShareVia),
    "__INITIAL_ADMIN__": settings.initialAdmin ? "true" : "false",
    "__PUBLIC_SETTINGS__": safeJsonForScript(settings),
    "__TTL_SECONDS__": String(settings.ttlSeconds),
    "__MAX_TITLE_LENGTH__": String(settings.maxTitleLength),
    "__MAX_TEXT_LENGTH__": String(settings.maxTextLength),
    "__MIN_PIN_LENGTH__": String(settings.minPinLength),
    "__MAX_PIN_LENGTH__": String(settings.maxPinLength),
    "__SEO_META_DESCRIPTION__": escapeHtml(settings.seoMetaDescription || settings.tagline || ""),
    "__SEO_TITLE__": escapeHtml(settings.seoSiteTitle || `${settings.appName} — ${settings.tagline}`),
    "__SEO_EXTRA_HEAD__": buildSeoHeadExtras(settings),
  };

  let html = APP_HTML;
  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.replaceAll(placeholder, value);
  }
  return html;
}

function buildSeoHeadExtras(settings) {
  if (!settings.seoEnabled) {
    return "";
  }
  const origin = String(settings.seoCanonicalBaseUrl || settings.requestOrigin || "").replace(/\/$/, "");
  const canonicalPath = !settings.canonicalPath || settings.canonicalPath === "/" ? "" : settings.canonicalPath;
  const canonicalUrl = origin ? `${origin}${canonicalPath}` : "";
  const ogImage = String(settings.seoOgImageUrl || "");
  const title = settings.seoSiteTitle || settings.appName;
  const description = settings.seoMetaDescription || settings.tagline || "";

  const parts = [];
  if (settings.seoKeywords) {
    parts.push(`<meta name="keywords" content="${escapeHtml(settings.seoKeywords)}">`);
  }
  parts.push(`<meta name="robots" content="${escapeHtml(settings.seoRobotsDirective || "index, follow")}">`);
  if (settings.seoGoogleSiteVerification) {
    parts.push(`<meta name="google-site-verification" content="${escapeHtml(settings.seoGoogleSiteVerification)}">`);
  }
  if (canonicalUrl) {
    parts.push(`<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`);
  }
  parts.push(`<meta property="og:site_name" content="${escapeHtml(settings.appName)}">`);
  parts.push(`<meta property="og:title" content="${escapeHtml(title)}">`);
  parts.push(`<meta property="og:description" content="${escapeHtml(description)}">`);
  parts.push(`<meta property="og:type" content="website">`);
  if (canonicalUrl) parts.push(`<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`);
  if (ogImage) parts.push(`<meta property="og:image" content="${escapeHtml(ogImage)}">`);
  parts.push(`<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">`);
  if (settings.seoTwitterHandle) parts.push(`<meta name="twitter:site" content="${escapeHtml(settings.seoTwitterHandle)}">`);
  parts.push(`<meta name="twitter:title" content="${escapeHtml(title)}">`);
  parts.push(`<meta name="twitter:description" content="${escapeHtml(description)}">`);
  if (ogImage) parts.push(`<meta name="twitter:image" content="${escapeHtml(ogImage)}">`);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: settings.appName,
    description,
    ...(origin ? { url: origin } : {}),
  };
  parts.push(`<script type="application/ld+json">${safeJsonForScript(structuredData)}</script>`);

  return parts.join("\n  ");
}

async function handleRobotsTxt(request, env, url) {
  const settings = await getSiteSettings(env);
  const allow = settings.seoEnabled && settings.seoRobotsDirective.startsWith("index");
  const lines = [
    "User-agent: *",
    allow ? "Allow: /" : "Disallow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    `Sitemap: ${url.origin}/sitemap.xml`,
  ];
  return new Response(lines.join("\n") + "\n", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

async function handleSitemapXml(request, env, url) {
  const settings = await getSiteSettings(env);
  const base = String(settings.seoCanonicalBaseUrl || url.origin).replace(/\/$/, "");
  const now = new Date().toISOString();
  const urls = [base + "/"];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((loc) => `  <url><loc>${escapeHtml(loc)}</loc><lastmod>${now}</lastmod></url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

function safeJsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSetupPage(problem) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AirText setup required</title>
  <style>
    body{margin:0;background:#171717;color:#f5f5f5;font-family:Inter,ui-sans-serif,system-ui,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}
    .card{max-width:700px;background:#242424;border:1px solid #3a3a3a;border-radius:8px;padding:32px;box-shadow:0 25px 80px rgba(0,0,0,.45)}
    code{background:#1c1c1c;padding:3px 8px;border-radius:4px;color:#a78bfa}.error{color:#fda4af}.steps{line-height:1.85;color:#cbd5e1}
  </style>
</head>
<body>
  <main class="card">
    <p style="color:#a78bfa;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Setup required</p>
    <h1 style="font-size:34px;margin:8px 0 14px">AirText is almost ready</h1>
    <p class="error"><strong>${escapeHtml(problem)}</strong></p>
    <div class="steps">
      <p>1. Open your existing D1 database named <code>airtext</code>.</p>
      <p>2. Bind it to this Worker using the variable name <code>DB</code>.</p>
      <p>3. Add a Worker secret named <code>APP_SECRET</code> containing at least 24 random characters.</p>
      <p>4. Add <code>ADMIN_PASSWORD</code> as a secret to enable <code>/admin</code>.</p>
      <p>5. Deploy the Worker again. The required D1 tables are created automatically.</p>
    </div>
  </main>
</body>
</html>`;
}

function renderRuntimeErrorPage(message = "Something went wrong.") {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AirText</title><style>body{background:#141410;color:#f5f5f5;font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}.box{max-width:620px;background:#1d1d19;border:1px solid #34342d;border-radius:12px;padding:32px}h1{margin-top:0;color:#c9f31d}a{color:#c9f31d}</style></head><body><div class="box"><h1>${escapeHtml(message)}</h1><p><a href="/">Return to AirText</a></p></div></body></html>`;
}

const APP_HTML = String.raw`<!doctype html>
<html lang="en" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#141410">
  <meta name="description" content="__SEO_META_DESCRIPTION__">
  <title>__SEO_TITLE__</title>
  __SEO_EXTRA_HEAD__

  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>

  <style type="text/tailwindcss">
    @theme {
      --font-sans: "IBM Plex Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
  </style>
  <style>
    :root {
      color-scheme: dark;
      --page: #141410;
      --panel: #1c1c18;
      --panel-soft: #181814;
      --line: #34342d;
      --muted: #9a9a8f;
      --text: #f7f7f2;
      --accent: #c9f31d;
      --accent-strong: #a8ce00;
      --accent-text: #12120f;
      --accent-soft: rgba(201, 243, 29, .10);
      --danger: #ff6b6b;
    }
    html[data-theme="light"] {
      color-scheme: light;
      --page: #f4f5ef;
      --panel: #ffffff;
      --panel-soft: #eceee6;
      --line: #d7dbcf;
      --muted: #687064;
      --text: #11120f;
      --accent: #a5cc00;
      --accent-strong: #87a900;
      --accent-text: #11120f;
      --accent-soft: rgba(165, 204, 0, .13);
      --danger: #c63f3f;
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      background: var(--page);
      color: var(--text);
      transition: background-color .2s ease, color .2s ease;
    }
    .app-shadow { box-shadow: 0 28px 90px rgba(0, 0, 0, .34); }
    .glass-panel {
      background: var(--panel);
      border: 1px solid var(--line);
    }
    .subtle-grid {
      background-image:
        linear-gradient(color-mix(in srgb, var(--line) 24%, transparent) 1px, transparent 1px),
        linear-gradient(90deg, color-mix(in srgb, var(--line) 24%, transparent) 1px, transparent 1px);
      background-size: 28px 28px;
    }
    .brand-mark {
      box-shadow: 0 10px 30px rgba(201, 243, 29, .16);
    }
    .linkified-text a {
      color: var(--accent);
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, var(--accent) 45%, transparent);
      text-underline-offset: 3px;
      transition: color .15s ease, text-decoration-color .15s ease;
    }
    .linkified-text a:hover {
      color: var(--accent-strong);
      text-decoration-color: currentColor;
    }
    button, input, textarea { -webkit-tap-highlight-color: transparent; }
    button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .fade-in { animation: fadeIn .18s ease-out both; }
    .slide-up { animation: slideUp .20s ease-out both; }
    .toast-enter { animation: slideUp .18s ease-out both; }
    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(10px) scale(.99) } to { opacity: 1; transform: translateY(0) scale(1) } }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
    }
    .scrollbar-thin::-webkit-scrollbar { width: 7px; height: 7px; }
    .scrollbar-thin::-webkit-scrollbar-thumb { background: #4a4a4a; border-radius: 999px; }
    .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
    #qr-output canvas, #qr-output img { border-radius: 8px; display: block; }
    #qr-reader { overflow: hidden; border: 0 !important; }
    #qr-reader video { border-radius: 8px; }
    #qr-reader__scan_region { background: transparent !important; }
    #qr-reader__dashboard_section { color: #bdbdbd !important; }
    #qr-reader button, #qr-reader select {
      background: var(--panel) !important;
      color: var(--text) !important;
      border: 1px solid var(--line) !important;
      border-radius: 10px !important;
      padding: 8px 12px !important;
    }
    .site-header { background: color-mix(in srgb, var(--page) 94%, transparent) !important; border-color: var(--line) !important; }
    .site-logo { background: var(--accent) !important; color: var(--accent-text) !important; border-radius: 999px !important; }
    .site-wordmark, .text-white, .text-slate-200, .text-neutral-200 { color: var(--text) !important; }
    .text-slate-400, .text-slate-500, .text-neutral-400, .text-neutral-500, .text-neutral-600, .text-slate-600, .text-slate-700 { color: var(--muted) !important; }
    .bg-violet-500, .bg-violet-600 { background: var(--accent) !important; color: var(--accent-text) !important; }
    .text-violet-300, .text-violet-400, .text-cyan-300 { color: var(--accent) !important; }
    .border-white\/5, .border-white\/10 { border-color: var(--line) !important; }
    input, textarea, select { color: var(--text) !important; }
    input::placeholder, textarea::placeholder { color: var(--muted) !important; opacity: .65; }
    .header-secondary-link { border-left: 1px solid var(--line); padding: 8px 10px; color: var(--muted); transition: color .16s ease; }
    .header-secondary-link:hover { color: var(--accent); }
    .announcement-bar { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 14px; margin-top: 12px; padding: 14px 17px; border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--line)); border-radius: 9px; background: linear-gradient(90deg, var(--accent-soft), transparent); color: var(--text); }
    .announcement-bar strong { font-size: clamp(14px, 1.7vw, 18px); letter-spacing: -.01em; }
    .announcement-label { display: inline-grid; place-items: center; min-height: 28px; padding: 0 10px; border-radius: 999px; background: var(--accent); color: var(--accent-text); font-size: 10px; font-weight: 900; letter-spacing: .12em; }
    .announcement-arrow { color: var(--accent); font-size: 23px; font-weight: 800; }
    .hero-shell { padding: 38px 0 34px; }
    .hero-grid { display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(350px, .88fr); align-items: center; gap: clamp(36px, 6vw, 82px); }
    .hero-content { min-width: 0; }
    .hero-kicker { color: var(--accent); font-weight: 700; letter-spacing: .14em; text-transform: uppercase; font-size: 12px; }
    .hero-title { margin-top: 14px; max-width: 760px; font-size: clamp(48px, 6.3vw, 88px); line-height: .94; font-weight: 800; letter-spacing: -.065em; color: var(--text); }
    .hero-title .outline-word { color: transparent; -webkit-text-stroke: 1.5px var(--text); text-stroke: 1.5px var(--text); }
    .hero-copy { margin-top: 22px; max-width: 630px; color: var(--muted); font-size: 15px; line-height: 1.7; }
    .hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 26px; }
    .hero-secondary-action { padding: 11px 16px; border: 1px solid var(--line); border-radius: 6px; color: var(--text); background: var(--panel); font-weight: 650; }
    .hero-secondary-action:hover { border-color: var(--accent); color: var(--accent); }
    .hero-flow-card { position: relative; isolation: isolate; overflow: hidden; min-height: 390px; padding: 30px; border: 1px solid var(--line); border-radius: 18px; background: linear-gradient(145deg, var(--panel), var(--panel-soft)); box-shadow: 0 32px 90px rgba(0,0,0,.28); }
    .hero-flow-card::after { content: ""; position: absolute; inset: auto -45px -50px auto; width: 180px; height: 180px; border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); border-radius: 50%; opacity: .6; }
    .hero-flow-glow { position: absolute; z-index: -1; top: -90px; right: -80px; width: 240px; height: 240px; border-radius: 50%; background: var(--accent); opacity: .13; filter: blur(20px); }
    .hero-flow-title { max-width: 330px; margin-top: 13px; color: var(--text); font-size: clamp(29px, 3vw, 43px); font-weight: 800; letter-spacing: -.05em; line-height: 1.02; }
    .hero-flow-copy { max-width: 390px; margin-top: 15px; color: var(--muted); font-size: 14px; line-height: 1.65; }
    .flow-path { display: flex; align-items: center; margin-top: 34px; }
    .flow-node { display: inline-grid; min-width: 68px; height: 36px; place-items: center; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: var(--panel); font-size: 11px; font-weight: 750; }
    .flow-node.active { border-color: var(--accent); background: var(--accent); color: var(--accent-text); }
    .flow-line { flex: 1; height: 1px; background: linear-gradient(90deg, var(--accent), var(--line)); }
    .hero-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 30px; }
    .hero-stats > div { padding: 15px; border: 1px solid var(--line); border-radius: 9px; background: color-mix(in srgb, var(--panel-soft) 80%, transparent); }
    .hero-stats strong, .hero-stats span { display: block; }
    .hero-stats strong { color: var(--text); font-size: 17px; }
    .hero-stats span { margin-top: 4px; color: var(--muted); font-size: 10px; }
    .ticker { overflow: hidden; margin: 10px 0 34px; border-block: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); background: var(--accent); color: var(--accent-text); }
    .ticker-track { display: flex; width: max-content; gap: 28px; padding: 12px 0; font-weight: 750; white-space: nowrap; animation: tickerMove 28s linear infinite; }
    .ticker-track span::after { content: "✳"; margin-left: 28px; }
    @keyframes tickerMove { to { transform: translateX(-50%); } }
    .icon-button { display: grid; width: 42px; height: 42px; place-items: center; border: 1px solid var(--line); border-radius: 8px; color: var(--text); background: var(--panel); transition: .18s ease; }
    .icon-button:hover { border-color: var(--accent); background: var(--accent); color: var(--accent-text); }
    .primary-action { background: var(--accent) !important; color: var(--accent-text) !important; border-radius: 6px !important; box-shadow: none !important; }
    .primary-action:hover { background: var(--accent-strong) !important; transform: translateY(-1px); }
    .drawer-backdrop { position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,.64); opacity: 0; visibility: hidden; transition: .22s ease; }
    .drawer-backdrop.open { opacity: 1; visibility: visible; }
    .side-drawer { position: fixed; top: 0; right: 0; z-index: 90; width: min(440px, 100%); height: 100dvh; overflow-y: auto; padding: 24px; background: var(--panel); border-left: 1px solid var(--line); transform: translateX(105%); transition: transform .26s ease; }
    .side-drawer.open { transform: translateX(0); }
    .guide-step { display: grid; grid-template-columns: 36px 1fr; gap: 14px; padding: 16px 0; border-bottom: 1px solid var(--line); }
    .step-number { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 999px; background: var(--accent); color: var(--accent-text); font-weight: 800; }
    .drawer-section { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--line); }
    .developer-card { display: flex; align-items: center; gap: 12px; margin-top: 18px; padding: 14px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel-soft); }
    .developer-avatar { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 50%; background: var(--accent); color: var(--accent-text); font-size: 18px; }
    .social-links { display: flex; flex-wrap: wrap; gap: 8px; }
    .social-link { display: inline-flex; align-items: center; min-height: 34px; padding: 0 11px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 11px; font-weight: 700; }
    .social-link:hover { border-color: var(--accent); color: var(--accent); }
    .form-field { width: 100%; border: 1px solid var(--line); border-radius: 7px; background: var(--panel-soft); padding: 12px 14px; outline: none; }
    .form-field:focus { border-color: var(--accent); }
    .notes-toolbar { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
    .notes-search { width: 100%; border: 0; background: transparent; outline: none; }
    .filter-select { border: 1px solid var(--line); border-radius: 6px; background: var(--panel-soft); padding: 8px 10px; color: var(--text); }
    .note-row { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 18px; padding: 17px 2px; border-bottom: 1px solid var(--line); transition: padding .18s ease, background .18s ease; }
    .note-row:last-child { border-bottom: 0; }
    .note-row:hover { background: var(--accent-soft); padding-inline: 12px; }
    .note-main { min-width: 0; }
    .note-meta { display: flex; flex-wrap: wrap; gap: 6px; }
    .note-badge { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 3px 8px; color: var(--muted); font-size: 9px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
    .note-title { margin-top: 8px; overflow: hidden; color: var(--text); font-size: 15px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .note-expiry { display: block; margin-top: 5px; color: var(--muted); font-size: 11px; }
    .note-actions { display: flex; align-items: center; gap: 7px; }
    .admin-screen { min-height: 100vh; background: var(--page); color: var(--text); }
    .admin-wrap { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 64px; }
    .admin-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .stat-card { padding: 20px; border: 1px solid var(--line); background: var(--panel); border-radius: 10px; }
    .stat-value { margin-top: 10px; font-size: 34px; font-weight: 800; letter-spacing: -.04em; }
    .admin-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(320px, .75fr); gap: 18px; margin-top: 18px; }
    .admin-panel { border: 1px solid var(--line); border-radius: 10px; background: var(--panel); overflow: hidden; }
    .admin-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--line); }
    .admin-panel-body { padding: 20px; }
    .admin-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; border-bottom: 1px solid var(--line); padding-bottom: 2px; }
    .admin-tab { padding: 10px 16px; border: 1px solid transparent; border-bottom: none; border-radius: 8px 8px 0 0; color: var(--muted); font-size: 13px; font-weight: 700; background: transparent; margin-bottom: -1px; }
    .admin-tab:hover { color: var(--text); }
    .admin-tab.active { color: var(--accent-text); background: var(--accent); border-color: var(--accent); }
    .admin-tab-panel.hidden { display: none; }
    .storage-bar { height: 10px; border-radius: 999px; background: var(--panel-soft); border: 1px solid var(--line); overflow: hidden; }
    .storage-bar-fill { height: 100%; background: var(--accent); width: 0%; transition: width .3s ease; }
    .danger-zone { padding: 16px; border: 1px solid rgba(248,113,113,.35); border-radius: 9px; background: rgba(248,113,113,.06); }
    .danger-zone .setting-toggle { border-bottom: none; padding-bottom: 0; }
    .admin-list-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 16px; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--line); }
    .admin-list-row:last-child { border-bottom: 0; }
    .settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
    .setting-toggle { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 13px 0; border-bottom: 1px solid var(--line); }
    .admin-content-editor { padding: 18px; border: 1px solid var(--line); border-radius: 9px; background: var(--panel-soft); }
    .admin-content-editor summary { cursor: pointer; color: var(--text); font-weight: 800; }
    .content-field-group { padding-top: 18px; border-top: 1px solid var(--line); }
    .content-field-group:first-child { padding-top: 0; border-top: 0; }
    .content-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-top: 12px; }
    .site-footer { margin-top: 34px; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--panel) 84%, var(--page)); }
    .footer-grid { display: grid; grid-template-columns: minmax(240px, 1.5fr) repeat(3, minmax(130px, .7fr)); gap: 32px; }
    .footer-grid:has(#footer-social-column.hidden-force) { grid-template-columns: minmax(240px, 1.5fr) repeat(2, minmax(130px, .7fr)); }
    .footer-heading { margin-bottom: 13px; color: var(--text); font-size: 11px; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; }
    .footer-links { display: grid; justify-items: start; gap: 10px; color: var(--muted); font-size: 13px; }
    .footer-links button:hover { color: var(--accent); }
    .footer-bottom { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; margin-top: 34px; padding-top: 20px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; }
    .footer-bottom strong { color: var(--text); }
    .maintenance-modal { position: fixed; inset: 0; z-index: 150; display: grid; place-items: center; padding: 20px; background: color-mix(in srgb, var(--page) 90%, transparent); backdrop-filter: blur(18px); }
    .maintenance-card { width: min(480px, 100%); padding: 34px; border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line)); border-radius: 16px; background: var(--panel); box-shadow: 0 40px 120px rgba(0,0,0,.5); text-align: center; }
    .maintenance-icon { display: grid; width: 58px; height: 58px; margin: 0 auto 20px; place-items: center; border-radius: 50%; background: var(--accent); color: var(--accent-text); }
    .maintenance-card h2 { margin-top: 12px; color: var(--text); font-size: 30px; font-weight: 850; letter-spacing: -.04em; }
    .maintenance-card p:not(.hero-kicker) { margin: 14px 0 24px; color: var(--muted); font-size: 14px; line-height: 1.7; }
    .bar-chart { display: grid; grid-template-columns: repeat(7,1fr); gap: 10px; align-items: end; height: 190px; padding-top: 20px; }
    .bar-column { display: flex; height: 100%; flex-direction: column; justify-content: flex-end; align-items: center; gap: 7px; color: var(--muted); font-size: 10px; }
    .bar-fill { width: min(36px, 80%); min-height: 4px; border-radius: 4px 4px 0 0; background: var(--accent); }
    .hidden-force { display: none !important; }
    html[data-theme="light"] .bg-\[\#1d1d1d\], html[data-theme="light"] .bg-\[\#1b1b1b\], html[data-theme="light"] .bg-\[\#242424\] { background: var(--panel-soft) !important; }
    html[data-theme="light"] .bg-black\/20, html[data-theme="light"] .bg-black\/25, html[data-theme="light"] .bg-black\/10 { background: var(--panel-soft) !important; }
    @media (max-width: 900px) {
      .admin-stats { grid-template-columns: repeat(2, 1fr); }
      .admin-grid { grid-template-columns: 1fr; }
      .desktop-nav-item { display: none !important; }
      .hero-grid { grid-template-columns: 1fr; }
      .hero-flow-card { min-height: auto; }
      .footer-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
    }
    @media (max-width: 640px) {
      .hero-shell { padding-top: 24px; }
      .hero-title { font-size: 48px; }
      .admin-stats, .settings-grid { grid-template-columns: 1fr; }
      .content-field-grid { grid-template-columns: 1fr; }
      .notes-toolbar { grid-template-columns: 1fr; }
      .admin-wrap { width: min(100% - 20px, 1180px); padding-top: 18px; }
      .side-drawer { padding: 20px; }
      .note-row { grid-template-columns: 1fr; gap: 12px; }
      .note-actions { justify-content: flex-start; }
      .announcement-bar { grid-template-columns: auto 1fr; }
      .announcement-arrow { display: none; }
      .hero-stats, .footer-grid { grid-template-columns: 1fr; }
      .hero-flow-card { padding: 24px; }
      .footer-bottom { flex-direction: column; }
    }
  </style>
  <script>
    (function () {
      try {
        var configured = __PUBLIC_SETTINGS__.defaultTheme || "system";
        var saved = localStorage.getItem("airtext_theme");
        var choice = saved || configured;
        var resolved = choice === "system"
          ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
          : choice;
        document.documentElement.setAttribute("data-theme", resolved);
      } catch (error) {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    })();
  </script>
</head>

<body class="subtle-grid font-sans antialiased selection:bg-violet-500/30 selection:text-white">
  <div id="public-app">
  <header class="site-header sticky top-0 z-40 border-b backdrop-blur-xl">
    <div class="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-7">
      <a href="/" class="flex items-center gap-3" aria-label="__APP_NAME__ home">
        <span class="site-logo brand-mark grid h-10 w-10 place-items-center text-white">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4M9 12h6M9 16h4"/></svg>
        </span>
        <span class="site-wordmark text-xl font-bold tracking-[-.04em]">__APP_NAME__</span>
      </a>

      <nav class="flex items-center gap-2 text-sm" aria-label="Primary navigation">
        <button id="header-create-text" type="button" data-action="focus-create" class="desktop-nav-item rounded-lg px-3 py-2 text-slate-400 transition hover:text-white">Share</button>
        <button id="header-available-text" type="button" data-action="focus-notes" class="desktop-nav-item rounded-lg px-3 py-2 text-slate-400 transition hover:text-white">Available</button>
        <button id="header-open-code-text" type="button" data-action="focus-join" class="desktop-nav-item rounded-lg px-3 py-2 text-slate-400 transition hover:text-white">Open code</button>
        <button id="header-guide-text" type="button" data-action="open-drawer-section" data-drawer-target="guide-drawer-section" class="desktop-nav-item header-secondary-link">Guide</button>
        <button id="header-files-text" type="button" data-action="focus-files" class="desktop-nav-item header-secondary-link">Files</button>
        <button id="header-qrtool-text" type="button" data-action="open-drawer-section" data-drawer-target="qrtool-drawer-section" class="desktop-nav-item header-secondary-link">QR for link</button>
        <button id="header-feedback-text" type="button" data-action="open-drawer-section" data-drawer-target="feedback-drawer-section" class="desktop-nav-item header-secondary-link">Feedback</button>
        <button id="header-about-text" type="button" data-action="open-drawer-section" data-drawer-target="about-drawer-section" class="desktop-nav-item header-secondary-link">About</button>
        <button type="button" data-action="toggle-theme" class="icon-button" aria-label="Toggle light or dark mode">
          <svg data-theme-icon viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>
        </button>
        <button type="button" data-action="open-drawer" class="icon-button" aria-label="Open menu">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
        <button id="header-new-note-text" type="button" data-action="focus-create" class="primary-action hidden px-5 py-3 font-semibold sm:inline-flex">New note →</button>
      </nav>
    </div>
  </header>

  <main class="mx-auto max-w-6xl px-5 py-8 sm:px-7 sm:py-12">
    <div id="announcement-bar" class="announcement-bar" role="status">
      <span id="announcement-label" class="announcement-label">NEW</span>
      <strong id="announcement-text">Move a note to another network with one secure link, short code or QR scan.</strong>
      <span class="announcement-arrow" aria-hidden="true">↗</span>
    </div>

    <section id="hero-section" class="hero-shell hero-grid">
      <div class="hero-content">
        <p id="hero-eyebrow" class="hero-kicker">Temporary text sharing</p>
        <h1 class="hero-title"><span id="hero-title-primary">Share text.</span><br><span id="hero-title-outline" class="outline-word">Instantly.</span></h1>
        <p id="hero-description" class="hero-copy">Create a temporary note, protect it with a PIN and move it between devices using a code, link or QR. No account required.</p>
        <div class="hero-actions">
          <button id="hero-primary-button" type="button" data-action="focus-create" class="primary-action px-5 py-3 font-semibold">Create a note →</button>
          <button id="hero-secondary-button" type="button" data-action="focus-join" class="hero-secondary-action">Open a code</button>
        </div>
      </div>

      <aside id="hero-panel" class="hero-flow-card" aria-label="AirText sharing flow">
        <div class="hero-flow-glow"></div>
        <div class="relative">
          <p id="hero-panel-eyebrow" class="hero-kicker">How it moves</p>
          <h2 id="hero-panel-title" class="hero-flow-title">One note. Every device.</h2>
          <p id="hero-panel-text" class="hero-flow-copy">Create once, then open it nearby or anywhere using the method that works best.</p>
          <div class="flow-path" aria-hidden="true">
            <span id="hero-panel-step1" class="flow-node active">Create</span>
            <span class="flow-line"></span>
            <span id="hero-panel-step2" class="flow-node">Share</span>
            <span class="flow-line"></span>
            <span id="hero-panel-step3" class="flow-node">Open</span>
          </div>
          <div class="hero-stats">
            <div><strong id="hero-stat1-value">3 ways</strong><span id="hero-stat1-label">Link · Code · QR</span></div>
            <div><strong id="hero-stat2-value">0 accounts</strong><span id="hero-stat2-label">Fast and temporary</span></div>
          </div>
        </div>
      </aside>
    </section>

    <div id="ticker-section" class="ticker" aria-label="AirText features">
      <div class="ticker-track">
        <span data-ticker-item="1">Cross-network sharing</span><span data-ticker-item="2">Automatic expiry</span><span data-ticker-item="3">Clickable links</span><span data-ticker-item="4">Private · Temporary · No account required</span>
        <span data-ticker-item="1">Cross-network sharing</span><span data-ticker-item="2">Automatic expiry</span><span data-ticker-item="3">Clickable links</span><span data-ticker-item="4">Private · Temporary · No account required</span>
      </div>
    </div>

    <div id="maintenance-banner" class="hidden mb-5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">Maintenance mode is active. Existing notes can still be opened, but new notes are disabled.</div>
    <section id="create-card" class="glass-panel app-shadow overflow-hidden rounded-2xl">
      <div class="flex items-center justify-between border-b border-white/[.07] px-5 py-5 sm:px-7">
        <div class="flex items-center gap-4">
          <span class="grid h-10 w-10 place-items-center rounded-full bg-[var(--accent-soft)] text-violet-300 ring-1 ring-inset ring-[var(--line)]">
            <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4M9 12h6M9 16h6"/>
            </svg>
          </span>
          <div>
            <h1 id="create-section-title" class="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Share text</h1>
            <p id="create-expiry-copy" class="mt-1 text-xs text-slate-500">Visible on this network · deleted automatically</p>
          </div>
        </div>
        <span id="create-temporary-badge" class="hidden rounded-full border border-cyan-400/15 bg-cyan-400/[.06] px-3 py-1 text-xs text-cyan-200/80 sm:inline">Temporary</span>
      </div>

      <form id="create-form" novalidate>
        <div class="px-5 pt-6 sm:px-7">
          <div class="flex items-center gap-4 border-b border-white/10 pb-4 focus-within:border-cyan-400/40">
            <label for="share-title" class="sr-only">Title</label>
            <input
              id="share-title"
              name="title"
              type="text"
              maxlength="__MAX_TITLE_LENGTH__"
              autocomplete="off"
              placeholder="Title"
              class="min-w-0 flex-1 bg-transparent text-lg font-medium text-white outline-none placeholder:text-slate-600"
            >
            <span id="title-counter" class="text-[11px] text-neutral-600">0 / __MAX_TITLE_LENGTH__</span>
          </div>

          <div class="relative">
            <label for="share-text" class="sr-only">Text</label>
            <textarea
              id="share-text"
              name="text"
              rows="12"
              maxlength="__MAX_TEXT_LENGTH__"
              placeholder="Type or paste something..."
              class="scrollbar-thin min-h-[240px] w-full resize-y bg-transparent py-6 text-[15px] leading-7 text-slate-200 outline-none placeholder:text-slate-600 sm:min-h-[290px]"
            ></textarea>
            <span id="text-counter" class="absolute bottom-4 right-0 text-[11px] text-neutral-600">0 / __MAX_TEXT_LENGTH__</span>
          </div>
        </div>

        <div class="border-t border-white/[.06] bg-black/10 px-5 py-4 sm:px-7">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex flex-wrap items-center gap-3">
              <label id="lock-control" class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
                <input id="lock-toggle" type="checkbox" class="peer sr-only">
                <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
                <span id="pin-toggle-text">Lock with PIN</span>
              </label>

              <div id="pin-field-wrap" class="hidden">
                <div class="relative">
                  <label for="share-pin" class="sr-only">Secret PIN</label>
                  <input
                    id="share-pin"
                    type="password"
                    minlength="__MIN_PIN_LENGTH__"
                    maxlength="__MAX_PIN_LENGTH__"
                    autocomplete="new-password"
                    placeholder="Secret PIN"
                    class="w-40 rounded-lg border border-white/10 bg-black/25 px-3 py-2 pr-9 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                  >
                  <button type="button" data-action="toggle-create-pin" class="absolute inset-y-0 right-0 grid w-9 place-items-center text-neutral-600 transition hover:text-white" aria-label="Show or hide PIN">
                    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8">
                      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.5"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <button
              id="create-submit"
              type="submit"
              class="primary-action inline-flex min-w-40 items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg data-button-icon viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
              <span data-button-label>Save note</span>
            </button>
          </div>
        </div>
      </form>
    </section>

    <p id="create-privacy-note" class="mt-3 text-xs leading-5 text-neutral-600">
      Only titles appear in the local list. Use a PIN for private content.
    </p>

    <section class="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
      <article id="notes-section" class="glass-panel overflow-hidden rounded-2xl">
        <div class="flex items-center justify-between gap-4 border-b border-white/5 px-5 py-4">
          <div>
            <h2 id="available-title" class="text-base font-semibold text-white">Available on this network</h2>
            <div class="mt-1 flex items-center gap-2 text-xs text-neutral-600">
              <span id="item-count">0 items</span>
              <span aria-hidden="true">·</span>
              <span id="last-refreshed">Loading</span>
            </div>
          </div>
          <button id="refresh-button" type="button" data-action="refresh-items" class="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Refresh local board">
            <svg data-refresh-icon viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.5-2L20 12M4 12l2.4 5a7 7 0 0 0 11.5-2"/>
            </svg>
          </button>
        </div>

        <div class="notes-toolbar">
          <label class="sr-only" for="notes-search">Search notes</label>
          <input id="notes-search" class="notes-search" type="search" placeholder="Search available notes…" autocomplete="off">
          <label class="sr-only" for="notes-filter">Filter notes</label>
          <select id="notes-filter" class="filter-select">
            <option value="all">All notes</option>
            <option value="mine">Mine</option>
            <option value="received">Received</option>
            <option value="open">Open</option>
            <option value="locked">Locked</option>
          </select>
        </div>

        <div class="p-4 sm:p-5">
          <div id="board-loading" class="py-12 text-center">
            <span class="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-violet-400"></span>
          </div>

          <div id="board-empty" class="hidden py-12 text-center">
            <p id="available-empty-text" class="text-sm text-neutral-500">No shared text yet.</p>
            <button type="button" data-action="focus-create" class="mt-3 text-sm font-medium text-violet-400 transition hover:text-violet-300">Create the first one</button>
          </div>

          <div id="board-list" class="hidden grid-cols-1 gap-2"></div>
        </div>
      </article>

      <aside id="join-card" class="glass-panel h-fit rounded-2xl p-5">
        <h2 id="open-code-title" class="text-base font-semibold text-white">Open a code</h2>
        <form id="join-form" class="mt-4 space-y-3" novalidate>
          <label for="join-code" class="sr-only">Share code</label>
          <input
            id="join-code"
            type="text"
            maxlength="12"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="ABC123"
            class="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-center font-mono text-lg font-semibold uppercase tracking-[.22em] text-white outline-none placeholder:tracking-[.16em] placeholder:text-slate-700 focus:border-cyan-400/50"
          >
          <button id="open-code-button-text" type="submit" class="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white">
            Open share
          </button>
        </form>
        <button id="scan-qr-text" type="button" data-action="open-scanner" class="mt-3 w-full rounded-md px-4 py-2.5 text-sm text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200">
          Scan QR instead
        </button>
      </aside>
    </section>

    <section id="files-card" class="glass-panel app-shadow mt-8 overflow-hidden rounded-2xl">
      <div class="flex items-center justify-between border-b border-white/[.07] px-5 py-5 sm:px-7">
        <div>
          <h2 id="files-section-title" class="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Share a file</h2>
          <p id="files-section-subtitle" class="mt-1 text-xs text-slate-500">Available for {duration} · deleted automatically</p>
        </div>
        <span id="files-temporary-badge" class="hidden rounded-full border border-cyan-400/15 bg-cyan-400/[.06] px-3 py-1 text-xs text-cyan-200/80 sm:inline">Temporary</span>
      </div>

      <form id="file-upload-form" class="px-5 py-6 sm:px-7" novalidate>
        <label id="files-drop-zone" for="file-input" class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 px-4 py-10 text-center transition hover:border-cyan-400/40">
          <svg viewBox="0 0 24 24" class="h-7 w-7 text-slate-500" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
          <span id="files-drop-hint" class="text-sm text-slate-400">Drag and drop a file here, or click to choose one.</span>
          <span id="file-input-name" class="text-xs text-slate-600"></span>
          <input id="file-input" name="file" type="file" class="sr-only">
        </label>

        <div class="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-1 items-center gap-4">
            <label for="file-title" class="sr-only">Title (optional)</label>
            <input id="file-title" name="title" type="text" maxlength="80" autocomplete="off" placeholder="Title (optional)" class="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
            <label id="file-lock-control" class="inline-flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
              <input id="file-lock-toggle" type="checkbox" class="peer sr-only">
              <span class="relative h-5 w-9 rounded-full bg-slate-700 transition peer-checked:bg-[var(--accent)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"></span>
              <span>PIN</span>
            </label>
            <div id="file-pin-field-wrap" class="hidden">
              <label for="file-pin" class="sr-only">Secret PIN</label>
              <input id="file-pin" type="password" minlength="__MIN_PIN_LENGTH__" maxlength="__MAX_PIN_LENGTH__" autocomplete="new-password" placeholder="Secret PIN" class="w-32 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50">
            </div>
          </div>
          <button id="file-upload-submit" type="submit" class="primary-action inline-flex min-w-40 items-center justify-center gap-2 px-6 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50">
            <span data-button-label id="files-upload-button-text">Upload file</span>
          </button>
        </div>
      </form>

      <p id="files-privacy-note" class="px-5 pb-5 text-xs leading-5 text-neutral-600 sm:px-7">Only titles appear in the available list. Use a PIN for private files.</p>

      <div class="border-t border-white/5 px-5 py-5 sm:px-7">
        <div class="flex items-center justify-between gap-4">
          <h3 id="files-available-title" class="text-base font-semibold text-white">Files available on this network</h3>
          <button id="files-refresh-button" type="button" data-action="refresh-files" class="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Refresh files board">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.5-2L20 12M4 12l2.4 5a7 7 0 0 0 11.5-2"/></svg>
          </button>
        </div>
        <div id="files-board-empty" class="hidden py-10 text-center">
          <p id="files-empty-text" class="text-sm text-neutral-500">No shared files yet.</p>
        </div>
        <div id="files-board-list" class="mt-3 hidden grid-cols-1 gap-2"></div>
      </div>
    </section>
  </main>

  <footer id="site-footer" class="site-footer">
    <div class="mx-auto max-w-6xl px-5 py-10 sm:px-7">
      <div class="footer-grid">
        <div>
          <a href="/" class="inline-flex items-center gap-3">
            <span class="site-logo grid h-10 w-10 place-items-center"><svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4M9 12h6M9 16h4"/></svg></span>
            <strong class="site-wordmark text-lg">__APP_NAME__</strong>
          </a>
          <p id="footer-tagline" class="mt-4 max-w-sm text-sm leading-6 text-slate-500">Temporary text sharing, made simple.</p>
        </div>
        <div>
          <p id="footer-explore-title" class="footer-heading">Explore</p>
          <div class="footer-links">
            <button id="footer-create-text" type="button" data-action="focus-create">Create note</button>
            <button id="footer-available-text" type="button" data-action="focus-notes">Available notes</button>
            <button id="footer-open-code-text" type="button" data-action="focus-join">Open code</button>
          </div>
        </div>
        <div>
          <p id="footer-information-title" class="footer-heading">Information</p>
          <div class="footer-links">
            <button id="footer-guide-text" type="button" data-action="open-drawer-section" data-drawer-target="guide-drawer-section">How to use</button>
            <button id="footer-feedback-text" type="button" data-action="open-drawer-section" data-drawer-target="feedback-drawer-section">Feedback</button>
            <button id="footer-about-text" type="button" data-action="open-drawer-section" data-drawer-target="about-drawer-section">About</button>
          </div>
        </div>
        <div id="footer-social-column">
          <p id="footer-connect-title" class="footer-heading">Connect</p>
          <div id="footer-social-links" class="social-links"></div>
        </div>
      </div>
      <div class="footer-bottom">
        <p id="footer-copyright">© <span id="footer-year"></span> __APP_NAME__. All rights reserved.</p>
        <p id="footer-developer-line">Designed and developed by <strong id="footer-developer-name">Farhan Ali</strong></p>
      </div>
    </div>
  </footer>
  </div>

  <div id="drawer-backdrop" class="drawer-backdrop" data-action="close-drawer"></div>
  <aside id="side-drawer" class="side-drawer" aria-hidden="true" aria-label="AirText menu">
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <span class="site-logo grid h-10 w-10 place-items-center"><svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4M9 12h6M9 16h4"/></svg></span>
        <strong>__APP_NAME__</strong>
      </div>
      <button type="button" data-action="close-drawer" class="icon-button" aria-label="Close menu"><svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    </div>

    <nav class="mt-7 grid gap-2" aria-label="Menu">
      <button id="drawer-create-text" type="button" data-action="drawer-create" class="primary-action px-4 py-3 text-left font-semibold">Create a note →</button>
      <button id="drawer-open-code-text" type="button" data-action="drawer-join" class="rounded-md border border-[var(--line)] px-4 py-3 text-left">Open a share code</button>
      <button id="drawer-scan-text" type="button" data-action="open-scanner" class="rounded-md border border-[var(--line)] px-4 py-3 text-left">Scan a QR code</button>
    </nav>

    <section id="guide-drawer-section" class="drawer-section">
      <p id="guide-eyebrow" class="hero-kicker">How to use</p>
      <h2 id="guide-title" class="mt-2 text-2xl font-bold text-white">Share in four steps</h2>
      <div class="mt-4">
        <div class="guide-step"><span class="step-number">1</span><div><strong id="guide-step1-title">Create</strong><p id="guide-step1-text" class="mt-1 text-sm text-slate-500">Add a title and paste or type your note.</p></div></div>
        <div class="guide-step"><span class="step-number">2</span><div><strong id="guide-step2-title">Protect</strong><p id="guide-step2-text" class="mt-1 text-sm text-slate-500">Optionally add a PIN before saving.</p></div></div>
        <div class="guide-step"><span class="step-number">3</span><div><strong id="guide-step3-title">Share</strong><p id="guide-step3-text" class="mt-1 text-sm text-slate-500">Send the link, short code or QR.</p></div></div>
        <div class="guide-step"><span class="step-number">4</span><div><strong id="guide-step4-title">Receive</strong><p id="guide-step4-text" class="mt-1 text-sm text-slate-500">Opening it adds the note to that network until expiry.</p></div></div>
      </div>
    </section>

    <section id="feedback-drawer-section" class="drawer-section">
      <p id="feedback-eyebrow" class="hero-kicker">Feedback</p>
      <h2 id="feedback-title" class="mt-2 text-2xl font-bold text-white">Help improve AirText</h2>
      <p id="feedback-intro" class="mt-2 text-sm leading-6 text-slate-500">Share a suggestion, report a problem or tell us what feels unclear.</p>
      <form id="feedback-form" class="mt-5 grid gap-3" novalidate>
        <select id="feedback-category" class="form-field">
          <option value="suggestion">Suggestion</option>
          <option value="bug">Bug report</option>
          <option value="design">Design feedback</option>
          <option value="other">Other</option>
        </select>
        <textarea id="feedback-message" class="form-field min-h-28 resize-y" maxlength="2000" placeholder="Tell us what you think…"></textarea>
        <input id="feedback-email" class="form-field" type="email" maxlength="200" placeholder="Email (optional)">
        <select id="feedback-rating" class="form-field">
          <option value="0">Rating (optional)</option>
          <option value="5">5 — Excellent</option>
          <option value="4">4 — Good</option>
          <option value="3">3 — Average</option>
          <option value="2">2 — Needs work</option>
          <option value="1">1 — Poor</option>
        </select>
        <button id="feedback-submit" type="submit" class="primary-action px-4 py-3 font-semibold">Submit feedback</button>
      </form>
    </section>

    <section id="about-drawer-section" class="drawer-section">
      <p id="about-eyebrow" class="hero-kicker">About</p>
      <h2 id="about-title" class="mt-2 text-2xl font-bold text-white">Simple sharing without an account</h2>
      <p id="about-text" class="mt-3 text-sm leading-6 text-slate-500">AirText is a lightweight way to move temporary text between nearby or remote devices.</p>
      <div class="developer-card">
        <span class="developer-avatar" aria-hidden="true">✦</span>
        <div>
          <strong id="developer-name">Farhan Ali</strong>
          <p id="developer-role" class="text-xs text-slate-500">Web Developer</p>
        </div>
      </div>
      <p id="developer-bio" class="mt-3 text-sm leading-6 text-slate-500">Building practical, privacy-conscious tools for the web.</p>
      <div id="drawer-social-links" class="social-links mt-4"></div>
      <div id="developer-contact-links" class="mt-4 flex flex-wrap gap-3 text-sm"></div>
    </section>

    <section id="qrtool-drawer-section" class="drawer-section">
      <p id="qrtool-eyebrow" class="hero-kicker">Utility</p>
      <h2 id="qrtool-title" class="mt-2 text-2xl font-bold text-white">QR code for any link</h2>
      <p id="qrtool-subtitle" class="mt-2 text-sm leading-6 text-slate-500">Paste a URL and get an instant QR code. Nothing is saved or sent to a server.</p>
      <form id="qrtool-form" class="mt-4 grid gap-3" novalidate>
        <label for="qrtool-input" class="sr-only">Link</label>
        <input id="qrtool-input" type="url" inputmode="url" autocomplete="off" placeholder="https://example.com" class="form-field" required>
        <button id="qrtool-button-text" type="submit" class="primary-action px-4 py-3 font-semibold">Generate QR</button>
      </form>
      <div id="qrtool-output-wrap" class="mt-4 hidden text-center">
        <div id="qrtool-output" class="mx-auto grid place-items-center rounded-xl bg-white p-4" style="width:fit-content"></div>
        <button id="qrtool-download-text" type="button" data-action="download-qrtool" class="mt-3 rounded-md border border-[var(--line)] px-4 py-2 text-sm">Download PNG</button>
      </div>
    </section>

    <section class="drawer-section text-sm leading-6 text-slate-500">
      <p><strong class="text-white">Privacy:</strong> <span id="privacy-text">Notes and configuration use D1. Network addresses are hashed before use; raw IP addresses are not stored in analytics.</span></p>
      <a id="admin-link-text" href="/admin" class="mt-5 inline-block text-violet-400">Administrator panel →</a>
    </section>
  </aside>

  <section id="admin-app" class="admin-screen hidden-force">
    <header class="site-header sticky top-0 z-40 border-b">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-7">
        <a href="/" class="flex items-center gap-3"><span class="site-logo grid h-10 w-10 place-items-center"><svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v4h4M9 12h6M9 16h4"/></svg></span><span class="site-wordmark text-lg font-bold">AirText Admin</span></a>
        <div class="flex items-center gap-2">
          <button type="button" data-action="toggle-theme" class="icon-button" aria-label="Toggle theme"><svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2"/></svg></button>
          <button id="admin-logout" type="button" class="hidden rounded-md border border-[var(--line)] px-4 py-2 text-sm">Sign out</button>
        </div>
      </div>
    </header>

    <div class="admin-wrap">
      <section id="admin-login-card" class="mx-auto mt-12 max-w-md rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <p class="hero-kicker">Administrator</p>
        <h1 class="mt-3 text-3xl font-bold text-white">Manage AirText</h1>
        <p id="admin-login-help" class="mt-2 text-sm leading-6 text-slate-500">Sign in using the ADMIN_PASSWORD secret configured in Cloudflare.</p>
        <form id="admin-login-form" class="mt-6 grid gap-3">
          <input id="admin-password" class="form-field" type="password" autocomplete="current-password" placeholder="Administrator password">
          <button id="admin-login-submit" type="submit" class="primary-action px-4 py-3 font-semibold">Sign in</button>
        </form>
      </section>

      <div id="admin-dashboard" class="hidden">
        <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div><p class="hero-kicker">Control center</p><h1 class="mt-2 text-4xl font-bold text-white">Dashboard</h1><p id="admin-storage-status" class="mt-2 text-xs text-slate-500">D1 primary storage · 0 routine KV writes</p></div>
          <button id="admin-refresh" type="button" class="rounded-md border border-[var(--line)] px-4 py-2 text-sm">Refresh data</button>
        </div>

        <div class="admin-tabs" role="tablist">
          <button type="button" class="admin-tab active" data-admin-tab="overview" role="tab" aria-selected="true">Overview</button>
          <button type="button" class="admin-tab" data-admin-tab="notes" role="tab" aria-selected="false">Notes</button>
          <button type="button" class="admin-tab" data-admin-tab="files" role="tab" aria-selected="false">Files</button>
          <button type="button" class="admin-tab" data-admin-tab="feedback" role="tab" aria-selected="false">Feedback</button>
          <button type="button" class="admin-tab" data-admin-tab="settings" role="tab" aria-selected="false">Settings</button>
        </div>

        <div class="admin-tab-panel" data-admin-panel="overview">
          <div id="admin-stats" class="admin-stats"></div>
          <div class="admin-grid mt-5">
            <section class="admin-panel">
              <div class="admin-panel-head"><div><h2 class="font-bold text-white">Activity</h2><p class="text-xs text-slate-500">Last seven days</p></div></div>
              <div class="admin-panel-body"><div id="admin-chart" class="bar-chart"></div></div>
            </section>
            <section class="admin-panel">
              <div class="admin-panel-head"><div><h2 class="font-bold text-white">Feature totals</h2><p class="text-xs text-slate-500">Retained analytics events</p></div></div>
              <div id="admin-event-counts" class="admin-panel-body grid gap-3 text-sm"></div>
            </section>
          </div>
        </div>

        <div class="admin-tab-panel hidden" data-admin-panel="notes">
          <section class="admin-panel"><div class="admin-panel-head"><div><h2 class="font-bold text-white">Active notes</h2><p class="text-xs text-slate-500">Metadata only; note text remains private.</p></div></div><div id="admin-notes" class="admin-panel-body"></div></section>
        </div>

        <div class="admin-tab-panel hidden" data-admin-panel="files">
          <section class="admin-panel">
            <div class="admin-panel-head"><div><h2 class="font-bold text-white">Storage usage</h2><p class="text-xs text-slate-500">Site-wide R2 storage against the configured cap.</p></div></div>
            <div class="admin-panel-body">
              <div id="admin-storage-bar" class="storage-bar"><div id="admin-storage-fill" class="storage-bar-fill"></div></div>
              <p id="admin-storage-label" class="mt-2 text-xs text-slate-500">—</p>
              <p id="admin-storage-warning" class="mt-2 text-xs text-amber-400 hidden"></p>
            </div>
          </section>
          <section class="admin-panel mt-5"><div class="admin-panel-head"><div><h2 class="font-bold text-white">Active files</h2><p class="text-xs text-slate-500">Metadata only; file contents remain private.</p></div></div><div id="admin-files" class="admin-panel-body"></div></section>
        </div>

        <div class="admin-tab-panel hidden" data-admin-panel="feedback">
          <section class="admin-panel"><div class="admin-panel-head"><div><h2 class="font-bold text-white">User feedback</h2><p class="text-xs text-slate-500">Review and resolve submissions.</p></div></div><div id="admin-feedback" class="admin-panel-body"></div></section>
        </div>

        <div class="admin-tab-panel hidden" data-admin-panel="settings">
        <section class="admin-panel">
          <div class="admin-panel-head"><div><h2 class="font-bold text-white">Site settings and limits</h2><p class="text-xs text-slate-500">Changes apply without redeploying.</p></div></div>
          <form id="admin-settings-form" class="admin-panel-body">
            <div class="settings-grid">
              <label class="grid gap-2 text-sm">Site name<input id="setting-app-name" class="form-field" maxlength="40"></label>
              <label class="grid gap-2 text-sm">Tagline<input id="setting-tagline" class="form-field" maxlength="100"></label>
              <label class="grid gap-2 text-sm sm:col-span-2">Announcement message<input id="setting-announcement" class="form-field" maxlength="1000"></label>
              <label class="grid gap-2 text-sm">Expiry in minutes<input id="setting-ttl" class="form-field" type="number" min="5" max="1440"></label>
              <label class="grid gap-2 text-sm">Notes per network<input id="setting-max-items" class="form-field" type="number" min="10" max="100"></label>
              <label class="grid gap-2 text-sm">Title length<input id="setting-title-length" class="form-field" type="number" min="20" max="120"></label>
              <label class="grid gap-2 text-sm">Text length<input id="setting-text-length" class="form-field" type="number" min="500" max="20000"></label>
              <label class="grid gap-2 text-sm">Create cooldown (seconds)<input id="setting-create-cooldown" class="form-field" type="number" min="1" max="60"></label>
              <label class="grid gap-2 text-sm">Unlock cooldown (seconds)<input id="setting-unlock-cooldown" class="form-field" type="number" min="1" max="30"></label>
              <label class="grid gap-2 text-sm">Default theme<select id="setting-default-theme" class="form-field"><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></label>
            </div>
            <details class="admin-content-editor mt-5" open>
              <summary>Public content editor</summary>
              <p class="mt-2 text-xs text-slate-500">Edit every public label, heading, description, developer detail, footer line, social URL, file-sharing limit, QR tool label and SEO field.</p>
              <div id="admin-content-fields" class="mt-5 grid gap-5"></div>
            </details>
            <div class="mt-5 grid gap-x-8 md:grid-cols-2">
              <label class="setting-toggle"><span>Allow new notes</span><input id="setting-notes-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>PIN protection</span><input id="setting-pin-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Cross-network auto-add</span><input id="setting-cross-network" type="checkbox"></label>
              <label class="setting-toggle"><span>Feedback form</span><input id="setting-feedback-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Privacy-safe analytics</span><input id="setting-analytics-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Hero section</span><input id="setting-hero-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Hero right panel</span><input id="setting-hero-panel-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Announcement line</span><input id="setting-announcement-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Feature ticker</span><input id="setting-ticker-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Create section</span><input id="setting-create-section-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Available notes section</span><input id="setting-available-section-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Open-code section</span><input id="setting-open-code-section-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>How-to guide</span><input id="setting-guide-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>About section</span><input id="setting-about-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Footer</span><input id="setting-footer-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Social links</span><input id="setting-social-links-enabled" type="checkbox"></label>
              <label class="setting-toggle"><span>Show copyright year</span><input id="setting-footer-show-year" type="checkbox"></label>
              <label class="setting-toggle"><span>Show developer credit</span><input id="setting-footer-show-developer" type="checkbox"></label>
            </div>
            <div class="danger-zone mt-6">
              <p class="text-xs font-bold uppercase tracking-wider text-red-300">Danger zone</p>
              <label class="setting-toggle"><span>Maintenance mode (pauses new notes and files site-wide)</span><input id="setting-maintenance" type="checkbox"></label>
            </div>
            <button id="admin-settings-submit" type="submit" class="primary-action mt-5 px-5 py-3 font-semibold">Save settings</button>
          </form>
        </section>
        </div>
      </div>
    </div>
  </section>

  <div id="maintenance-modal" class="maintenance-modal hidden-force" role="dialog" aria-modal="true" aria-labelledby="maintenance-title">
    <div class="maintenance-card">
      <span class="maintenance-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v5M12 16v5M4.2 7.5l4.3 2.5M15.5 14l4.3 2.5M4.2 16.5 8.5 14M15.5 10l4.3-2.5"/><circle cx="12" cy="12" r="3"/></svg>
      </span>
      <p id="maintenance-eyebrow" class="hero-kicker">Scheduled maintenance</p>
      <h2 id="maintenance-title">AirText is under maintenance</h2>
      <p id="maintenance-message">We are making a few improvements. New notes are temporarily paused; please check again shortly.</p>
      <button id="maintenance-button" type="button" data-action="refresh-page" class="primary-action w-full px-5 py-3 font-semibold">Refresh page</button>
    </div>
  </div>

  <!-- View modal -->
  <div id="item-modal" class="fixed inset-0 z-50 hidden items-end justify-center bg-[#02040a]/80 p-0 backdrop-blur-sm sm:items-center sm:p-5" aria-hidden="true">
    <div data-modal-panel class="glass-panel slide-up max-h-[92vh] w-full max-w-2xl overflow-hidden shadow-2xl sm:rounded-2xl">
      <div class="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4 sm:px-6">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span id="modal-lock-badge" class="rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"></span>
            <span id="modal-expiry" data-expires="0" class="rounded border border-white/10 px-2 py-1 text-[10px] text-neutral-500">Expires soon</span>
          </div>
          <h2 id="modal-title" class="mt-3 truncate text-xl font-semibold text-white">Shared text</h2>
        </div>
        <button type="button" data-action="close-item-modal" class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Close">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </div>

      <div class="scrollbar-thin max-h-[calc(92vh-80px)] overflow-y-auto p-5 sm:p-6">
        <div id="modal-loading" class="py-14 text-center">
          <span class="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-violet-400"></span>
          <p class="mt-3 text-sm text-neutral-500">Opening…</p>
        </div>

        <div id="modal-error" class="hidden border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300"></div>

        <form id="unlock-form" class="hidden" novalidate>
          <div class="rounded-xl border border-white/[.07] bg-black/20 p-5">
            <h3 class="font-medium text-white">PIN required</h3>
            <p class="mt-1 text-sm text-neutral-500">Enter the PIN provided by the sender.</p>
            <label for="unlock-pin" class="sr-only">Secret PIN</label>
            <input id="unlock-pin" type="password" maxlength="__MAX_PIN_LENGTH__" autocomplete="current-password" placeholder="Secret PIN" class="mt-5 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-700 focus:border-cyan-400/50">
            <button id="unlock-submit" type="submit" class="mt-3 w-full rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50">
              Unlock
            </button>
          </div>
        </form>

        <div id="modal-content" class="hidden">
          <div class="overflow-hidden rounded-xl border border-white/[.07] bg-black/20">
            <div class="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <p class="text-xs text-neutral-600">TEXT</p>
              <button type="button" data-action="copy-text" class="rounded-md px-3 py-1.5 text-xs text-neutral-400 transition hover:bg-white/5 hover:text-white">Copy</button>
            </div>
            <pre id="modal-text" class="linkified-text scrollbar-thin max-h-[48vh] overflow-auto whitespace-pre-wrap break-words p-5 font-sans text-sm leading-7 text-slate-200"></pre>
          </div>

          <div class="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" data-action="show-current-qr" class="flex-1 rounded-md border border-white/10 px-4 py-3 text-sm text-neutral-300 transition hover:border-violet-500/60 hover:bg-violet-500/10 hover:text-white">
              Code & QR
            </button>
            <button id="delete-item-button" type="button" data-action="delete-current-item" class="hidden flex-1 items-center justify-center rounded-md border border-red-500/20 px-4 py-3 text-sm text-red-300 transition hover:bg-red-500/10">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="file-modal" class="fixed inset-0 z-50 hidden items-end justify-center bg-[#02040a]/80 p-0 backdrop-blur-sm sm:items-center sm:p-5" aria-hidden="true">
    <div data-modal-panel class="glass-panel slide-up max-h-[92vh] w-full max-w-lg overflow-hidden shadow-2xl sm:rounded-2xl">
      <div class="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4 sm:px-6">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span id="file-modal-lock-badge" class="rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"></span>
            <span id="file-modal-expiry" class="rounded border border-white/10 px-2 py-1 text-[10px] text-neutral-500">Expires soon</span>
          </div>
          <h2 id="file-modal-title" class="mt-3 truncate text-xl font-semibold text-white">Shared file</h2>
        </div>
        <button type="button" data-action="close-file-modal" class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[.06] hover:text-white" aria-label="Close">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </div>

      <div class="scrollbar-thin max-h-[calc(92vh-80px)] overflow-y-auto p-5 sm:p-6">
        <div id="file-modal-loading" class="py-14 text-center">
          <span class="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-violet-400"></span>
          <p class="mt-3 text-sm text-neutral-500">Opening…</p>
        </div>

        <div id="file-modal-error" class="hidden border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300"></div>

        <form id="file-unlock-form" class="hidden" novalidate>
          <div class="rounded-xl border border-white/[.07] bg-black/20 p-5">
            <h3 class="font-medium text-white">PIN required</h3>
            <p class="mt-1 text-sm text-neutral-500">Enter the PIN provided by the sender.</p>
            <label for="file-unlock-pin" class="sr-only">Secret PIN</label>
            <input id="file-unlock-pin" type="password" maxlength="__MAX_PIN_LENGTH__" autocomplete="current-password" placeholder="Secret PIN" class="mt-5 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-700 focus:border-cyan-400/50">
            <button id="file-unlock-submit" type="submit" class="mt-3 w-full rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50">
              Unlock
            </button>
          </div>
        </form>

        <div id="file-modal-content" class="hidden">
          <div class="overflow-hidden rounded-xl border border-white/[.07] bg-black/20 p-5">
            <p id="file-modal-filename" class="truncate text-sm text-slate-200"></p>
            <p id="file-modal-meta" class="mt-1 text-xs text-neutral-500"></p>
          </div>
          <div class="mt-4 flex flex-col gap-2 sm:flex-row">
            <a id="file-modal-download" href="#" class="flex-1 rounded-md bg-violet-500 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-violet-400">Download</a>
            <button type="button" data-action="show-current-file-qr" class="flex-1 rounded-md border border-white/10 px-4 py-3 text-sm text-neutral-300 transition hover:border-violet-500/60 hover:bg-violet-500/10 hover:text-white">Code & QR</button>
            <button id="delete-file-button" type="button" data-action="delete-current-file" class="hidden flex-1 items-center justify-center rounded-md border border-red-500/20 px-4 py-3 text-sm text-red-300 transition hover:bg-red-500/10">Delete</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- QR modal -->
  <div id="qr-modal" class="fixed inset-0 z-[60] hidden items-end justify-center bg-[#02040a]/85 p-0 backdrop-blur-sm sm:items-center sm:p-5" aria-hidden="true">
    <div class="glass-panel slide-up w-full max-w-sm p-5 shadow-2xl sm:rounded-2xl">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-white">Share code</h2>
        <button type="button" data-action="close-qr-modal" class="grid h-9 w-9 place-items-center rounded-md text-neutral-500 transition hover:bg-white/5 hover:text-white" aria-label="Close">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </div>

      <div class="mt-5 rounded-xl bg-white p-4">
        <div id="qr-output" class="grid place-items-center"></div>
      </div>

      <div class="mt-4 border border-white/5 bg-[#1d1d1d] px-4 py-3 text-center">
        <p id="qr-code-text" class="font-mono text-2xl font-semibold tracking-[.25em] text-white">------</p>
      </div>

      <div class="mt-3 flex items-center gap-2 border border-white/5 bg-[#1d1d1d] p-2 pl-3">
        <input id="qr-link-input" readonly class="min-w-0 flex-1 bg-transparent text-xs text-neutral-500 outline-none">
        <button type="button" data-action="copy-link" class="rounded-md bg-violet-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-400">Copy link</button>
      </div>

      <button type="button" data-action="copy-code" class="mt-3 w-full rounded-md border border-white/10 px-4 py-3 text-sm text-neutral-300 transition hover:bg-white/5 hover:text-white">Copy code</button>
    </div>
  </div>

  <!-- Scanner modal -->
  <div id="scanner-modal" class="fixed inset-0 z-[70] hidden items-end justify-center bg-[#02040a]/85 p-0 backdrop-blur-sm sm:items-center sm:p-5" aria-hidden="true">
    <div class="glass-panel slide-up w-full max-w-lg p-5 shadow-2xl sm:rounded-2xl">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-white">Scan QR</h2>
        <button type="button" data-action="close-scanner" class="grid h-9 w-9 place-items-center rounded-md text-neutral-500 transition hover:bg-white/5 hover:text-white" aria-label="Close scanner">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <div id="qr-reader" class="mt-5 min-h-64 bg-[#1b1b1b]"></div>
      <p id="scanner-status" class="mt-4 text-center text-sm text-neutral-500">Starting camera…</p>
    </div>
  </div>

  <div id="toast-container" class="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"></div>

  <script>
    (function () {
      "use strict";

      var APP = Object.assign({}, __PUBLIC_SETTINGS__, {
        initialShareCode: __INITIAL_SHARE_CODE__,
        initialShareVia: __INITIAL_SHARE_VIA__,
        initialAdmin: __INITIAL_ADMIN__,
        minPinLength: __MIN_PIN_LENGTH__,
        maxPinLength: __MAX_PIN_LENGTH__
      });

      var state = {
        items: [],
        optimisticItems: Object.create(null),
        currentItem: null,
        currentSource: null,
        currentCode: null,
        currentVia: null,
        qrCode: null,
        scanner: null,
        scannerRunning: false,
        pollingTimer: null,
        adminData: null,
        files: [],
        currentFile: null,
        currentFileCode: null
      };

      var el = {};

      document.addEventListener("DOMContentLoaded", init);

      function init() {
        cacheElements();
        bindEvents();
        syncThemeButtons();

        if (APP.initialAdmin) {
          el.publicApp.classList.add("hidden-force");
          el.adminApp.classList.remove("hidden-force");
          initAdmin();
          return;
        }

        applyPublicSettings();
        updateCounters();
        loadLocalItems(false);
        loadLocalFiles(false);
        startPolling();
        window.setInterval(updateCountdowns, 1000);

        if (APP.initialShareCode) {
          window.setTimeout(function () {
            openShareByCode(APP.initialShareCode, true, APP.initialShareVia || "link");
          }, 120);
        }
        if (APP.initialFileShareCode) {
          window.setTimeout(function () {
            openFileShareByCode(APP.initialFileShareCode, true, APP.initialShareVia || "link");
          }, 120);
        }
      }

      function cacheElements() {
        el.publicApp = document.getElementById("public-app");
        el.adminApp = document.getElementById("admin-app");
        el.createForm = document.getElementById("create-form");
        el.createSubmit = document.getElementById("create-submit");
        el.shareTitle = document.getElementById("share-title");
        el.shareText = document.getElementById("share-text");
        el.lockToggle = document.getElementById("lock-toggle");
        el.pinFieldWrap = document.getElementById("pin-field-wrap");
        el.sharePin = document.getElementById("share-pin");
        el.titleCounter = document.getElementById("title-counter");
        el.textCounter = document.getElementById("text-counter");
        el.lockControl = document.getElementById("lock-control");
        el.maintenanceBanner = document.getElementById("maintenance-banner");
        el.createExpiryCopy = document.getElementById("create-expiry-copy");

        el.joinForm = document.getElementById("join-form");
        el.joinCode = document.getElementById("join-code");

        el.fileUploadForm = document.getElementById("file-upload-form");
        el.fileUploadSubmit = document.getElementById("file-upload-submit");
        el.fileInput = document.getElementById("file-input");
        el.fileInputName = document.getElementById("file-input-name");
        el.fileTitle = document.getElementById("file-title");
        el.fileLockToggle = document.getElementById("file-lock-toggle");
        el.filePinFieldWrap = document.getElementById("file-pin-field-wrap");
        el.filePin = document.getElementById("file-pin");
        el.filesDropZone = document.getElementById("files-drop-zone");
        el.filesBoardEmpty = document.getElementById("files-board-empty");
        el.filesBoardList = document.getElementById("files-board-list");
        el.filesRefreshButton = document.getElementById("files-refresh-button");

        el.fileModal = document.getElementById("file-modal");
        el.fileModalLoading = document.getElementById("file-modal-loading");
        el.fileModalError = document.getElementById("file-modal-error");
        el.fileModalTitle = document.getElementById("file-modal-title");
        el.fileModalLockBadge = document.getElementById("file-modal-lock-badge");
        el.fileModalExpiry = document.getElementById("file-modal-expiry");
        el.fileUnlockForm = document.getElementById("file-unlock-form");
        el.fileUnlockPin = document.getElementById("file-unlock-pin");
        el.fileUnlockSubmit = document.getElementById("file-unlock-submit");
        el.fileModalContent = document.getElementById("file-modal-content");
        el.fileModalFilename = document.getElementById("file-modal-filename");
        el.fileModalMeta = document.getElementById("file-modal-meta");
        el.fileModalDownload = document.getElementById("file-modal-download");
        el.deleteFileButton = document.getElementById("delete-file-button");

        el.qrtoolForm = document.getElementById("qrtool-form");
        el.qrtoolInput = document.getElementById("qrtool-input");
        el.qrtoolOutputWrap = document.getElementById("qrtool-output-wrap");
        el.qrtoolOutput = document.getElementById("qrtool-output");

        el.boardLoading = document.getElementById("board-loading");
        el.boardEmpty = document.getElementById("board-empty");
        el.boardList = document.getElementById("board-list");
        el.itemCount = document.getElementById("item-count");
        el.lastRefreshed = document.getElementById("last-refreshed");
        el.refreshButton = document.getElementById("refresh-button");
        el.notesSearch = document.getElementById("notes-search");
        el.notesFilter = document.getElementById("notes-filter");

        el.itemModal = document.getElementById("item-modal");
        el.modalLoading = document.getElementById("modal-loading");
        el.modalError = document.getElementById("modal-error");
        el.modalTitle = document.getElementById("modal-title");
        el.modalLockBadge = document.getElementById("modal-lock-badge");
        el.modalExpiry = document.getElementById("modal-expiry");
        el.unlockForm = document.getElementById("unlock-form");
        el.unlockPin = document.getElementById("unlock-pin");
        el.unlockSubmit = document.getElementById("unlock-submit");
        el.modalContent = document.getElementById("modal-content");
        el.modalText = document.getElementById("modal-text");
        el.deleteButton = document.getElementById("delete-item-button");

        el.qrModal = document.getElementById("qr-modal");
        el.qrOutput = document.getElementById("qr-output");
        el.qrCodeText = document.getElementById("qr-code-text");
        el.qrLinkInput = document.getElementById("qr-link-input");

        el.scannerModal = document.getElementById("scanner-modal");
        el.scannerStatus = document.getElementById("scanner-status");

        el.drawer = document.getElementById("side-drawer");
        el.drawerBackdrop = document.getElementById("drawer-backdrop");
        el.feedbackSection = document.getElementById("feedback-drawer-section");
        el.feedbackForm = document.getElementById("feedback-form");
        el.feedbackCategory = document.getElementById("feedback-category");
        el.feedbackMessage = document.getElementById("feedback-message");
        el.feedbackEmail = document.getElementById("feedback-email");
        el.feedbackRating = document.getElementById("feedback-rating");
        el.feedbackSubmit = document.getElementById("feedback-submit");

        el.adminLoginCard = document.getElementById("admin-login-card");
        el.adminLoginHelp = document.getElementById("admin-login-help");
        el.adminLoginForm = document.getElementById("admin-login-form");
        el.adminPassword = document.getElementById("admin-password");
        el.adminLoginSubmit = document.getElementById("admin-login-submit");
        el.adminDashboard = document.getElementById("admin-dashboard");
        el.adminLogout = document.getElementById("admin-logout");
        el.adminRefresh = document.getElementById("admin-refresh");
        el.adminStats = document.getElementById("admin-stats");
        el.adminChart = document.getElementById("admin-chart");
        el.adminEventCounts = document.getElementById("admin-event-counts");
        el.adminSettingsForm = document.getElementById("admin-settings-form");
        el.adminSettingsSubmit = document.getElementById("admin-settings-submit");
        el.adminNotes = document.getElementById("admin-notes");
        el.adminFeedback = document.getElementById("admin-feedback");
        el.adminFiles = document.getElementById("admin-files");
        el.adminStorageBar = document.getElementById("admin-storage-bar");
        el.adminStorageFill = document.getElementById("admin-storage-fill");
        el.adminStorageLabel = document.getElementById("admin-storage-label");
        el.adminStorageWarning = document.getElementById("admin-storage-warning");
        el.adminTabs = document.querySelectorAll("[data-admin-tab]");
        el.adminTabPanels = document.querySelectorAll("[data-admin-panel]");
        el.adminContentFields = document.getElementById("admin-content-fields");
        el.adminStorageStatus = document.getElementById("admin-storage-status");

        el.settingAppName = document.getElementById("setting-app-name");
        el.settingTagline = document.getElementById("setting-tagline");
        el.settingAnnouncement = document.getElementById("setting-announcement");
        el.settingTtl = document.getElementById("setting-ttl");
        el.settingMaxItems = document.getElementById("setting-max-items");
        el.settingTitleLength = document.getElementById("setting-title-length");
        el.settingTextLength = document.getElementById("setting-text-length");
        el.settingCreateCooldown = document.getElementById("setting-create-cooldown");
        el.settingUnlockCooldown = document.getElementById("setting-unlock-cooldown");
        el.settingDefaultTheme = document.getElementById("setting-default-theme");
        el.settingNotesEnabled = document.getElementById("setting-notes-enabled");
        el.settingPinEnabled = document.getElementById("setting-pin-enabled");
        el.settingCrossNetwork = document.getElementById("setting-cross-network");
        el.settingFeedbackEnabled = document.getElementById("setting-feedback-enabled");
        el.settingAnalyticsEnabled = document.getElementById("setting-analytics-enabled");
        el.settingMaintenance = document.getElementById("setting-maintenance");
        el.settingHeroEnabled = document.getElementById("setting-hero-enabled");
        el.settingHeroPanelEnabled = document.getElementById("setting-hero-panel-enabled");
        el.settingAnnouncementEnabled = document.getElementById("setting-announcement-enabled");
        el.settingTickerEnabled = document.getElementById("setting-ticker-enabled");
        el.settingCreateSectionEnabled = document.getElementById("setting-create-section-enabled");
        el.settingAvailableSectionEnabled = document.getElementById("setting-available-section-enabled");
        el.settingOpenCodeSectionEnabled = document.getElementById("setting-open-code-section-enabled");
        el.settingGuideEnabled = document.getElementById("setting-guide-enabled");
        el.settingAboutEnabled = document.getElementById("setting-about-enabled");
        el.settingFooterEnabled = document.getElementById("setting-footer-enabled");
        el.settingSocialLinksEnabled = document.getElementById("setting-social-links-enabled");
        el.settingFooterShowYear = document.getElementById("setting-footer-show-year");
        el.settingFooterShowDeveloper = document.getElementById("setting-footer-show-developer");
      }

      function bindEvents() {
        el.createForm.addEventListener("submit", createShare);
        el.joinForm.addEventListener("submit", function (event) {
          event.preventDefault();
          var code = normalizeCode(el.joinCode.value);
          if (!code) return toast("Enter a valid share code.", "error");
          openAnyShareByCode(code, true, "code");
        });
        el.unlockForm.addEventListener("submit", unlockCurrentItem);
        el.feedbackForm.addEventListener("submit", submitFeedback);
        el.notesSearch.addEventListener("input", renderLocalItems);
        el.notesFilter.addEventListener("change", renderLocalItems);
        el.fileUploadForm.addEventListener("submit", createFileShare);
        el.fileUnlockForm.addEventListener("submit", unlockCurrentFile);
        el.fileLockToggle.addEventListener("change", function () {
          el.filePinFieldWrap.classList.toggle("hidden", !el.fileLockToggle.checked);
          if (el.fileLockToggle.checked) window.setTimeout(function () { el.filePin.focus(); }, 60);
          else el.filePin.value = "";
        });
        el.fileInput.addEventListener("change", function () {
          var file = el.fileInput.files && el.fileInput.files[0];
          el.fileInputName.textContent = file ? file.name : "";
        });
        el.filesDropZone.addEventListener("dragover", function (event) { event.preventDefault(); });
        el.filesDropZone.addEventListener("drop", function (event) {
          event.preventDefault();
          var dropped = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
          if (dropped) {
            el.fileInput.files = event.dataTransfer.files;
            el.fileInputName.textContent = dropped.name;
          }
        });
        el.filesRefreshButton.addEventListener("click", function () { loadLocalFiles(true); });
        el.qrtoolForm.addEventListener("submit", generateLinkQrTool);
        el.adminLoginForm.addEventListener("submit", adminLogin);
        el.adminSettingsForm.addEventListener("submit", saveAdminSettings);
        el.adminLogout.addEventListener("click", adminLogout);
        el.adminRefresh.addEventListener("click", loadAdminDashboard);
        el.adminTabs.forEach(function (tab) {
          tab.addEventListener("click", function () { switchAdminTab(tab.getAttribute("data-admin-tab")); });
        });

        el.shareTitle.addEventListener("input", updateCounters);
        el.shareText.addEventListener("input", updateCounters);
        el.lockToggle.addEventListener("change", function () {
          el.pinFieldWrap.classList.toggle("hidden", !el.lockToggle.checked);
          if (el.lockToggle.checked) window.setTimeout(function () { el.sharePin.focus(); }, 60);
          else el.sharePin.value = "";
        });
        el.joinCode.addEventListener("input", function () {
          el.joinCode.value = normalizeCode(el.joinCode.value);
        });

        document.addEventListener("click", function (event) {
          var actionElement = event.target.closest("[data-action]");
          if (!actionElement) return;
          var action = actionElement.getAttribute("data-action");

          if (action === "focus-create") focusSection("create-card", "share-title");
          if (action === "focus-join") focusSection("join-card", "join-code");
          if (action === "focus-notes") focusSection("notes-section", "notes-search");
          if (action === "focus-files") focusSection("files-card", "file-title");
          if (action === "refresh-items") loadLocalItems(true);
          if (action === "refresh-files") loadLocalFiles(true);
          if (action === "open-scanner") {
            if (el.drawer.classList.contains("open")) closeDrawer();
            openScanner();
          }
          if (action === "close-scanner") closeScanner();
          if (action === "close-item-modal") closeItemModal();
          if (action === "close-file-modal") closeFileModal();
          if (action === "close-qr-modal") closeQrModal();
          if (action === "toggle-create-pin") togglePassword(el.sharePin);
          if (action === "copy-text") copyText(state.currentItem && state.currentItem.text, "Text copied.");
          if (action === "show-current-qr") showQrForCurrentItem();
          if (action === "show-current-file-qr") showQrForCurrentFile();
          if (action === "download-qrtool") downloadQrToolPng();
          if (action === "copy-link") copyText(el.qrLinkInput.value, "Share link copied.");
          if (action === "copy-code") copyText(el.qrCodeText.textContent, "Share code copied.");
          if (action === "delete-current-item") deleteCurrentItem();
          if (action === "delete-current-file") deleteCurrentFile();
          if (action === "toggle-theme") toggleTheme();
          if (action === "open-drawer") openDrawer();
          if (action === "open-drawer-section") {
            openDrawer(actionElement.getAttribute("data-drawer-target"));
          }
          if (action === "close-drawer") closeDrawer();
          if (action === "refresh-page") window.location.reload();
          if (action === "drawer-create") {
            closeDrawer();
            focusSection("create-card", "share-title");
          }
          if (action === "drawer-join") {
            closeDrawer();
            focusSection("join-card", "join-code");
          }

          var itemId = actionElement.getAttribute("data-item-id");
          if (action === "open-local-item" && itemId) openLocalItem(itemId);
          if (action === "share-local-item" && itemId) showQrForListItem(itemId);

          var fileId = actionElement.getAttribute("data-file-id");
          if (action === "open-local-file" && fileId) openLocalFile(fileId);
          if (action === "share-local-file" && fileId) showQrForListFile(fileId);

          var adminItemId = actionElement.getAttribute("data-admin-item-id");
          if (action === "admin-delete-note" && adminItemId) adminDeleteNote(adminItemId);
          var adminFileId = actionElement.getAttribute("data-admin-file-id");
          if (action === "admin-delete-file" && adminFileId) adminDeleteFile(adminFileId);
          var feedbackId = actionElement.getAttribute("data-feedback-id");
          if (action === "admin-feedback-status" && feedbackId) {
            updateFeedbackStatus(feedbackId, actionElement.getAttribute("data-feedback-status"));
          }
          if (action === "admin-delete-feedback" && feedbackId) deleteFeedback(feedbackId);
        });

        [el.itemModal, el.fileModal, el.qrModal, el.scannerModal].forEach(function (modal) {
          modal.addEventListener("click", function (event) {
            if (event.target !== modal) return;
            if (modal === el.itemModal) closeItemModal();
            if (modal === el.fileModal) closeFileModal();
            if (modal === el.qrModal) closeQrModal();
            if (modal === el.scannerModal) closeScanner();
          });
        });

        document.addEventListener("keydown", function (event) {
          if (event.key !== "Escape") return;
          if (!el.scannerModal.classList.contains("hidden")) closeScanner();
          else if (!el.qrModal.classList.contains("hidden")) closeQrModal();
          else if (!el.fileModal.classList.contains("hidden")) closeFileModal();
          else if (!el.itemModal.classList.contains("hidden")) closeItemModal();
          else if (el.drawer.classList.contains("open")) closeDrawer();
        });
      }

      async function createShare(event) {
        event.preventDefault();
        if (APP.maintenanceMode || !APP.notesEnabled) {
          return toast("New notes are currently disabled.", "error");
        }

        var title = el.shareTitle.value.trim();
        var text = el.shareText.value.trim();
        var locked = APP.pinEnabled && el.lockToggle.checked;
        var pin = el.sharePin.value.trim();

        if (!title) return fieldError(el.shareTitle, "Add a title.");
        if (!text) return fieldError(el.shareText, "Add some text to share.");
        if (locked && (pin.length < APP.minPinLength || pin.length > APP.maxPinLength)) {
          return fieldError(el.sharePin, "PIN must be " + APP.minPinLength + "–" + APP.maxPinLength + " characters.");
        }

        setButtonLoading(el.createSubmit, true, "Creating share…");

        try {
          var response = await apiFetch("/api/items", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: title, text: text, locked: locked, pin: pin })
          });

          saveDeleteToken(response.item.id, response.deleteToken);
          upsertLocalItem(response.item, true);
          renderLocalItems();
          el.lastRefreshed.textContent = "Added just now";
          resetCreateForm();
          showQr(response.item.code, response.shareUrl);
          toast("Note created instantly. It expires in " + formatDuration(APP.ttlSeconds) + ".", "success");
        } catch (error) {
          toast(error.message || "Unable to create share.", "error");
        } finally {
          setButtonLoading(el.createSubmit, false, APP.createButtonText);
        }
      }

      async function loadLocalItems(showFeedback) {
        if (el.refreshButton.disabled) return;
        el.refreshButton.disabled = true;
        var icon = el.refreshButton.querySelector("[data-refresh-icon]");
        if (icon) icon.classList.add("animate-spin");

        try {
          var response = await apiFetch("/api/local/items");
          state.items = reconcileLocalItems(Array.isArray(response.items) ? response.items : []);
          renderLocalItems();
          el.lastRefreshed.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          if (showFeedback) toast("Local board refreshed.", "success");
        } catch (error) {
          el.boardLoading.classList.add("hidden");
          if (showFeedback || state.items.length === 0) toast(error.message || "Unable to load the local board.", "error");
        } finally {
          el.refreshButton.disabled = false;
          if (icon) icon.classList.remove("animate-spin");
        }
      }

      function renderLocalItems() {
        var now = Date.now();
        state.items = state.items.filter(function (item) { return Number(item.expiresAt) > now; });
        var query = String(el.notesSearch.value || "").trim().toLowerCase();
        var filter = el.notesFilter.value || "all";
        var visibleItems = state.items.filter(function (item) {
          var matchesText = !query || String(item.title || "").toLowerCase().indexOf(query) !== -1 ||
            String(item.code || "").toLowerCase().indexOf(query) !== -1;
          var matchesFilter = filter === "all" ||
            (filter === "mine" && item.source === "mine") ||
            (filter === "received" && item.source === "received") ||
            (filter === "open" && !item.locked) ||
            (filter === "locked" && item.locked);
          return matchesText && matchesFilter;
        });

        el.boardLoading.classList.add("hidden");
        el.itemCount.textContent = state.items.length + (state.items.length === 1 ? " item" : " items");
        el.boardList.textContent = "";

        if (visibleItems.length === 0) {
          el.boardList.classList.add("hidden");
          el.boardEmpty.classList.remove("hidden");
          var emptyText = el.boardEmpty.querySelector("p");
          if (emptyText) emptyText.textContent = state.items.length ? "No notes match this view." : APP.availableEmptyText;
          return;
        }

        el.boardEmpty.classList.add("hidden");
        el.boardList.classList.remove("hidden");

        visibleItems.forEach(function (item) {
          var card = document.createElement("article");
          card.className = "note-row";

          var titleWrap = document.createElement("div");
          titleWrap.className = "note-main";

          var meta = document.createElement("div");
          meta.className = "note-meta";
          var sourceBadge = document.createElement("span");
          sourceBadge.className = "note-badge";
          sourceBadge.textContent = item.source === "received" ? "Received" : "Mine";
          var lockBadge = document.createElement("span");
          lockBadge.className = "note-badge";
          lockBadge.textContent = item.locked ? "PIN locked" : "Open";
          meta.appendChild(sourceBadge);
          meta.appendChild(lockBadge);

          var title = document.createElement("h3");
          title.className = "note-title";
          title.textContent = item.title;

          var expiry = document.createElement("span");
          expiry.className = "note-expiry";
          expiry.setAttribute("data-expires", String(item.expiresAt));
          expiry.textContent = formatRemaining(item.expiresAt);

          titleWrap.appendChild(meta);
          titleWrap.appendChild(title);
          titleWrap.appendChild(expiry);

          var actions = document.createElement("div");
          actions.className = "note-actions";

          var openButton = document.createElement("button");
          openButton.type = "button";
          openButton.setAttribute("data-action", "open-local-item");
          openButton.setAttribute("data-item-id", item.id);
          openButton.className = "primary-action px-4 py-2 text-xs font-semibold";
          openButton.textContent = item.locked ? "Enter PIN" : "Open";

          var qrButton = document.createElement("button");
          qrButton.type = "button";
          qrButton.setAttribute("data-action", "share-local-item");
          qrButton.setAttribute("data-item-id", item.id);
          qrButton.className = "icon-button";
          qrButton.setAttribute("aria-label", "Show share code and QR");
          qrButton.innerHTML = '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h.01M17 7h.01M7 17h.01"/><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-2zM14 18h2v2h-2z"/></svg>';

          actions.appendChild(openButton);
          actions.appendChild(qrButton);
          card.appendChild(titleWrap);
          card.appendChild(actions);
          el.boardList.appendChild(card);
        });
      }

      async function openLocalItem(itemId) {
        state.currentSource = "local";
        state.currentCode = null;
        state.currentVia = "network";
        openItemModal();

        try {
          var response = await apiFetch("/api/local/item/" + encodeURIComponent(itemId));
          showItemResponse(response.item, "local", null);
        } catch (error) {
          showModalError(error.message || "Unable to open this item.");
        }
      }

      async function openAnyShareByCode(rawCode, updateUrl, via) {
        var code = normalizeCode(rawCode);
        if (!code) return toast("Invalid share code.", "error");
        try {
          var probe = await apiFetch("/api/share/" + encodeURIComponent(code) + "?via=" + encodeURIComponent(via || "link"));
          state.currentSource = "share";
          state.currentCode = code;
          state.currentVia = via;
          el.joinCode.value = code;
          openItemModal();
          if (updateUrl && window.location.pathname !== "/s/" + code) {
            window.history.pushState({}, "", "/s/" + code);
          }
          showItemResponse(probe.item, "share", code);
        } catch (error) {
          if (error.code === "CODE_NOT_FOUND") {
            return openFileShareByCode(code, updateUrl, via);
          }
          state.currentSource = "share";
          state.currentCode = code;
          el.joinCode.value = code;
          openItemModal();
          showModalError(error.message || "Unable to open this share code.");
        }
      }

      async function openShareByCode(rawCode, updateUrl, via) {
        var code = normalizeCode(rawCode);
        if (!code) return toast("Invalid share code.", "error");
        via = via === "qr" || via === "code" ? via : "link";

        state.currentSource = "share";
        state.currentCode = code;
        state.currentVia = via;
        el.joinCode.value = code;
        openItemModal();

        if (updateUrl && window.location.pathname !== "/s/" + code) {
          window.history.pushState({}, "", "/s/" + code);
        }

        try {
          var response = await apiFetch("/api/share/" + encodeURIComponent(code) + "?via=" + encodeURIComponent(via));
          showItemResponse(response.item, "share", code);
        } catch (error) {
          showModalError(error.message || "Unable to open this share code.");
        }
      }

      function showItemResponse(item, source, code) {
        state.currentItem = item;
        state.currentSource = source;
        state.currentCode = code || item.code;

        el.modalLoading.classList.add("hidden");
        el.modalError.classList.add("hidden");
        el.modalTitle.textContent = item.title;
        el.modalExpiry.setAttribute("data-expires", String(item.expiresAt));
        el.modalExpiry.textContent = formatRemaining(item.expiresAt);
        setLockBadge(item.locked);

        if (typeof item.text === "string") {
          el.unlockForm.classList.add("hidden");
          el.modalContent.classList.remove("hidden");
          renderLinkedText(el.modalText, item.text);
          updateDeleteButton(item.id);
          if (source === "share") {
            upsertLocalItem(Object.assign({}, item, {
              source: getDeleteToken(item.id) ? "mine" : "received",
              addedAt: Date.now()
            }), true);
            renderLocalItems();
            el.lastRefreshed.textContent = "Added just now";
          }
        } else {
          el.modalContent.classList.add("hidden");
          el.unlockForm.classList.remove("hidden");
          el.unlockPin.value = "";
          window.setTimeout(function () { el.unlockPin.focus(); }, 120);
        }
      }

      async function unlockCurrentItem(event) {
        event.preventDefault();
        if (!state.currentItem) return;

        var pin = el.unlockPin.value.trim();
        if (!pin) return fieldError(el.unlockPin, "Enter the PIN.");

        el.unlockSubmit.disabled = true;
        el.unlockSubmit.textContent = "Checking PIN…";

        var path = state.currentSource === "local"
          ? "/api/local/item/" + encodeURIComponent(state.currentItem.id) + "/unlock"
          : "/api/share/" + encodeURIComponent(state.currentCode) + "/unlock?via=" + encodeURIComponent(state.currentVia || "link");

        try {
          var response = await apiFetch(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pin: pin })
          });
          showItemResponse(response.item, state.currentSource, state.currentCode);
          toast("Text unlocked.", "success");
        } catch (error) {
          toast(error.message || "Unable to unlock text.", "error");
          el.unlockPin.select();
        } finally {
          el.unlockSubmit.disabled = false;
          el.unlockSubmit.textContent = "Unlock text";
        }
      }

      async function deleteCurrentItem() {
        if (!state.currentItem) return;
        var token = getDeleteToken(state.currentItem.id);
        if (!token) return toast("This browser does not own the delete token.", "error");
        if (!window.confirm("Delete this share now? This cannot be undone.")) return;

        el.deleteButton.disabled = true;
        try {
          await apiFetch("/api/item/" + encodeURIComponent(state.currentItem.id), {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ deleteToken: token })
          });
          removeDeleteToken(state.currentItem.id);
          delete state.optimisticItems[state.currentItem.id];
          state.items = state.items.filter(function (item) { return item.id !== state.currentItem.id; });
          renderLocalItems();
          closeItemModal();
          toast("Share deleted.", "success");
        } catch (error) {
          toast(error.message || "Unable to delete share.", "error");
        } finally {
          el.deleteButton.disabled = false;
        }
      }

      function openItemModal() {
        state.currentItem = null;
        el.modalTitle.textContent = "Opening share";
        el.modalLoading.classList.remove("hidden");
        el.modalError.classList.add("hidden");
        el.modalContent.classList.add("hidden");
        el.unlockForm.classList.add("hidden");
        el.deleteButton.classList.add("hidden");
        el.deleteButton.classList.remove("inline-flex");
        el.itemModal.classList.remove("hidden");
        el.itemModal.classList.add("flex");
        el.itemModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();
      }

      function closeItemModal() {
        el.itemModal.classList.add("hidden");
        el.itemModal.classList.remove("flex");
        el.itemModal.setAttribute("aria-hidden", "true");
        state.currentItem = null;
        state.currentSource = null;
        state.currentCode = null;
        state.currentVia = null;
        unlockBodyScrollIfClear();
        if (/^\/s\//.test(window.location.pathname)) window.history.pushState({}, "", "/");
      }

      function showModalError(message) {
        el.modalLoading.classList.add("hidden");
        el.unlockForm.classList.add("hidden");
        el.modalContent.classList.add("hidden");
        el.modalError.textContent = message;
        el.modalError.classList.remove("hidden");
        el.modalTitle.textContent = "Unable to open share";
        setLockBadge(false, true);
      }

      function setLockBadge(locked, error) {
        el.modalLockBadge.className = "rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider";
        if (error) {
          el.modalLockBadge.classList.add("border-red-500/25", "bg-red-500/5", "text-red-300");
          el.modalLockBadge.textContent = "Unavailable";
        } else if (locked) {
          el.modalLockBadge.classList.add("border-violet-500/25", "bg-violet-500/10", "text-violet-300");
          el.modalLockBadge.textContent = "PIN locked";
        } else {
          el.modalLockBadge.classList.add("border-white/10", "bg-white/[.03]", "text-neutral-400");
          el.modalLockBadge.textContent = "Open text";
        }
      }

      function updateDeleteButton(itemId) {
        var token = getDeleteToken(itemId);
        el.deleteButton.classList.toggle("hidden", !token);
        el.deleteButton.classList.toggle("inline-flex", Boolean(token));
      }

      function showQrForCurrentItem() {
        if (!state.currentItem || !state.currentItem.code) return;
        showQr(state.currentItem.code, window.location.origin + "/s/" + state.currentItem.code);
      }

      function showQrForListItem(itemId) {
        var item = state.items.find(function (entry) { return entry.id === itemId; });
        if (!item) return toast("Share not found in the current board.", "error");
        showQr(item.code, window.location.origin + "/s/" + item.code);
      }

      /* ---------------------------------------------------------------- */
      /* File sharing (temporary, no account required)                    */
      /* ---------------------------------------------------------------- */

      async function createFileShare(event) {
        event.preventDefault();
        if (APP.maintenanceMode || !APP.fileSharingEnabled) {
          return toast("File sharing is currently disabled.", "error");
        }
        var file = el.fileInput.files && el.fileInput.files[0];
        if (!file) return toast("Choose a file to share.", "error");
        var maxBytes = (APP.maxFileSizeMB || 25) * 1024 * 1024;
        if (file.size > maxBytes) {
          return toast("Files must be " + (APP.maxFileSizeMB || 25) + "MB or smaller.", "error");
        }

        var locked = APP.pinEnabled && el.fileLockToggle.checked;
        var pin = el.filePin.value.trim();
        if (locked && (pin.length < APP.minPinLength || pin.length > APP.maxPinLength)) {
          return fieldError(el.filePin, "PIN must be " + APP.minPinLength + "–" + APP.maxPinLength + " characters.");
        }

        var form = new FormData();
        form.append("file", file);
        form.append("title", el.fileTitle.value.trim());
        form.append("locked", locked ? "1" : "0");
        if (locked) form.append("pin", pin);

        setButtonLoading(el.fileUploadSubmit, true, "Uploading…");
        try {
          var response = await apiFetch("/api/files", { method: "POST", body: form });
          saveDeleteToken("file:" + response.file.id, response.deleteToken);
          upsertLocalFile(response.file);
          renderFilesBoard();
          resetFileUploadForm();
          showQr(response.file.code, response.shareUrl);
          toast("File uploaded. It expires in " + formatDuration(APP.fileTtlSeconds || APP.ttlSeconds) + ".", "success");
        } catch (error) {
          toast(error.message || "Unable to upload the file.", "error");
        } finally {
          setButtonLoading(el.fileUploadSubmit, false, APP.filesUploadButtonText || "Upload file");
        }
      }

      function resetFileUploadForm() {
        el.fileUploadForm.reset();
        el.fileInputName.textContent = "";
        el.filePinFieldWrap.classList.add("hidden");
      }

      function upsertLocalFile(file) {
        state.files = state.files.filter(function (entry) { return entry.id !== file.id; });
        state.files.unshift(file);
      }

      async function loadLocalFiles(showFeedback) {
        if (!el.filesRefreshButton) return;
        if (el.filesRefreshButton.disabled) return;
        el.filesRefreshButton.disabled = true;
        try {
          var response = await apiFetch("/api/local/files");
          var now = Date.now();
          state.files = (Array.isArray(response.files) ? response.files : [])
            .filter(function (item) { return Number(item.expiresAt) > now; });
          renderFilesBoard();
          if (showFeedback) toast("Files board refreshed.", "success");
        } catch (error) {
          if (showFeedback) toast(error.message || "Unable to load shared files.", "error");
        } finally {
          el.filesRefreshButton.disabled = false;
        }
      }

      function renderFilesBoard() {
        if (!el.filesBoardList) return;
        var now = Date.now();
        state.files = state.files.filter(function (item) { return Number(item.expiresAt) > now; });
        el.filesBoardList.textContent = "";

        if (!state.files.length) {
          el.filesBoardList.classList.add("hidden");
          el.filesBoardEmpty.classList.remove("hidden");
          return;
        }
        el.filesBoardEmpty.classList.add("hidden");
        el.filesBoardList.classList.remove("hidden");

        state.files.forEach(function (item) {
          var card = document.createElement("article");
          card.className = "note-row";

          var titleWrap = document.createElement("div");
          titleWrap.className = "note-main";

          var meta = document.createElement("div");
          meta.className = "note-meta";
          var sourceBadge = document.createElement("span");
          sourceBadge.className = "note-badge";
          sourceBadge.textContent = item.source === "received" ? "Received" : "Mine";
          var lockBadge = document.createElement("span");
          lockBadge.className = "note-badge";
          lockBadge.textContent = item.locked ? "PIN locked" : "Open";
          var sizeBadge = document.createElement("span");
          sizeBadge.className = "note-badge";
          sizeBadge.textContent = formatBytes(item.sizeBytes);
          meta.appendChild(sourceBadge);
          meta.appendChild(lockBadge);
          meta.appendChild(sizeBadge);

          var title = document.createElement("h3");
          title.className = "note-title";
          title.textContent = item.title;

          var expiry = document.createElement("span");
          expiry.className = "note-expiry";
          expiry.setAttribute("data-expires", String(item.expiresAt));
          expiry.textContent = formatRemaining(item.expiresAt);

          titleWrap.appendChild(meta);
          titleWrap.appendChild(title);
          titleWrap.appendChild(expiry);

          var actions = document.createElement("div");
          actions.className = "note-actions";

          var openButton = document.createElement("button");
          openButton.type = "button";
          openButton.setAttribute("data-action", "open-local-file");
          openButton.setAttribute("data-file-id", item.id);
          openButton.className = "primary-action px-4 py-2 text-xs font-semibold";
          openButton.textContent = item.locked ? "Enter PIN" : "Open";

          var qrButton = document.createElement("button");
          qrButton.type = "button";
          qrButton.setAttribute("data-action", "share-local-file");
          qrButton.setAttribute("data-file-id", item.id);
          qrButton.className = "icon-button";
          qrButton.setAttribute("aria-label", "Show share code and QR");
          qrButton.innerHTML = '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h.01M17 7h.01M7 17h.01"/><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-2zM14 18h2v2h-2z"/></svg>';

          actions.appendChild(openButton);
          actions.appendChild(qrButton);
          card.appendChild(titleWrap);
          card.appendChild(actions);
          el.filesBoardList.appendChild(card);
        });
      }

      async function openLocalFile(fileId) {
        state.currentFileCode = null;
        openFileModal();
        try {
          var response = await apiFetch("/api/local/file/" + encodeURIComponent(fileId));
          showFileResponse(response.file, "local", null);
        } catch (error) {
          showFileModalError(error.message || "Unable to open this file.");
        }
      }

      async function openFileShareByCode(rawCode, updateUrl, via) {
        var code = normalizeCode(rawCode);
        if (!code) return toast("Invalid share code.", "error");
        via = via === "qr" || via === "code" ? via : "link";

        state.currentFileCode = code;
        openFileModal();

        if (updateUrl && window.location.pathname !== "/f/" + code) {
          window.history.pushState({}, "", "/f/" + code);
        }

        try {
          var response = await apiFetch("/api/share/file/" + encodeURIComponent(code) + "?via=" + encodeURIComponent(via));
          showFileResponse(response.file, "share", code);
        } catch (error) {
          showFileModalError(error.message || "Unable to open this share code.");
        }
      }

      function showFileResponse(file, source, code) {
        state.currentFile = file;
        state.currentFileCode = code || file.code;

        el.fileModalLoading.classList.add("hidden");
        el.fileModalError.classList.add("hidden");
        el.fileModalTitle.textContent = file.title;
        el.fileModalExpiry.setAttribute("data-expires", String(file.expiresAt));
        el.fileModalExpiry.textContent = formatRemaining(file.expiresAt);
        setFileLockBadge(file.locked);

        if (file.downloadUrl) {
          el.fileUnlockForm.classList.add("hidden");
          el.fileModalContent.classList.remove("hidden");
          el.fileModalFilename.textContent = file.filename;
          el.fileModalMeta.textContent = formatBytes(file.sizeBytes) + " · " + file.downloadCount + " downloads";
          el.fileModalDownload.href = file.downloadUrl;
          el.fileModalDownload.setAttribute("download", file.filename);
          updateFileDeleteButton(file.id);
          if (source === "share") {
            upsertLocalFile(Object.assign({}, file, {
              source: getDeleteToken("file:" + file.id) ? "mine" : "received",
              addedAt: Date.now()
            }));
            renderFilesBoard();
          }
        } else {
          el.fileModalContent.classList.add("hidden");
          el.fileUnlockForm.classList.remove("hidden");
          el.fileUnlockPin.value = "";
          window.setTimeout(function () { el.fileUnlockPin.focus(); }, 120);
        }
      }

      async function unlockCurrentFile(event) {
        event.preventDefault();
        if (!state.currentFile) return;
        var pin = el.fileUnlockPin.value.trim();
        if (!pin) return fieldError(el.fileUnlockPin, "Enter the PIN.");

        el.fileUnlockSubmit.disabled = true;
        el.fileUnlockSubmit.textContent = "Checking PIN…";

        var path = state.currentFile && !state.currentFileCode
          ? "/api/local/file/" + encodeURIComponent(state.currentFile.id) + "/unlock"
          : "/api/share/file/" + encodeURIComponent(state.currentFileCode) + "/unlock";

        try {
          var response = await apiFetch(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pin: pin })
          });
          showFileResponse(response.file, state.currentFileCode ? "share" : "local", state.currentFileCode);
          toast("File unlocked.", "success");
        } catch (error) {
          toast(error.message || "Unable to unlock file.", "error");
          el.fileUnlockPin.select();
        } finally {
          el.fileUnlockSubmit.disabled = false;
          el.fileUnlockSubmit.textContent = "Unlock";
        }
      }

      async function deleteCurrentFile() {
        if (!state.currentFile) return;
        var token = getDeleteToken("file:" + state.currentFile.id);
        if (!token) return toast("This browser does not own the delete token.", "error");
        if (!window.confirm("Delete this file now? This cannot be undone.")) return;

        el.deleteFileButton.disabled = true;
        try {
          await apiFetch("/api/file/" + encodeURIComponent(state.currentFile.id), {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ deleteToken: token })
          });
          removeDeleteToken("file:" + state.currentFile.id);
          state.files = state.files.filter(function (item) { return item.id !== state.currentFile.id; });
          renderFilesBoard();
          closeFileModal();
          toast("File deleted.", "success");
        } catch (error) {
          toast(error.message || "Unable to delete file.", "error");
        } finally {
          el.deleteFileButton.disabled = false;
        }
      }

      function openFileModal() {
        state.currentFile = null;
        el.fileModalTitle.textContent = "Opening file";
        el.fileModalLoading.classList.remove("hidden");
        el.fileModalError.classList.add("hidden");
        el.fileModalContent.classList.add("hidden");
        el.fileUnlockForm.classList.add("hidden");
        el.deleteFileButton.classList.add("hidden");
        el.deleteFileButton.classList.remove("inline-flex");
        el.fileModal.classList.remove("hidden");
        el.fileModal.classList.add("flex");
        el.fileModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();
      }

      function closeFileModal() {
        el.fileModal.classList.add("hidden");
        el.fileModal.classList.remove("flex");
        el.fileModal.setAttribute("aria-hidden", "true");
        state.currentFile = null;
        state.currentFileCode = null;
        unlockBodyScrollIfClear();
        if (/^\/f\//.test(window.location.pathname)) window.history.pushState({}, "", "/");
      }

      function showFileModalError(message) {
        el.fileModalLoading.classList.add("hidden");
        el.fileUnlockForm.classList.add("hidden");
        el.fileModalContent.classList.add("hidden");
        el.fileModalError.textContent = message;
        el.fileModalError.classList.remove("hidden");
        el.fileModalTitle.textContent = "Unable to open file";
        setFileLockBadge(false, true);
      }

      function setFileLockBadge(locked, error) {
        el.fileModalLockBadge.className = "rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider";
        if (error) {
          el.fileModalLockBadge.classList.add("border-red-500/25", "bg-red-500/5", "text-red-300");
          el.fileModalLockBadge.textContent = "Unavailable";
        } else if (locked) {
          el.fileModalLockBadge.classList.add("border-violet-500/25", "bg-violet-500/10", "text-violet-300");
          el.fileModalLockBadge.textContent = "PIN locked";
        } else {
          el.fileModalLockBadge.classList.add("border-white/10", "bg-white/[.03]", "text-neutral-400");
          el.fileModalLockBadge.textContent = "Open file";
        }
      }

      function updateFileDeleteButton(fileId) {
        var token = getDeleteToken("file:" + fileId);
        el.deleteFileButton.classList.toggle("hidden", !token);
        el.deleteFileButton.classList.toggle("inline-flex", Boolean(token));
      }

      function showQrForCurrentFile() {
        if (!state.currentFile || !state.currentFile.code) return;
        showQr(state.currentFile.code, window.location.origin + "/f/" + state.currentFile.code);
      }

      function showQrForListFile(fileId) {
        var item = state.files.find(function (entry) { return entry.id === fileId; });
        if (!item) return toast("Shared file not found on this board.", "error");
        showQr(item.code, window.location.origin + "/f/" + item.code);
      }

      /* ---------------------------------------------------------------- */
      /* Standalone QR generator for links (client-side only)             */
      /* ---------------------------------------------------------------- */

      async function generateLinkQrTool(event) {
        event.preventDefault();
        var raw = el.qrtoolInput.value.trim();
        if (!raw) return fieldError(el.qrtoolInput, "Paste a link first.");
        var href = toSafeLinkHref(raw);
        if (!href) return fieldError(el.qrtoolInput, "Enter a valid http(s) link.");

        el.qrtoolOutput.textContent = "";
        try {
          await ensureScript("https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js", "QRCode");
        } catch (error) {}

        if (typeof window.QRCode === "function") {
          new window.QRCode(el.qrtoolOutput, {
            text: href,
            width: 220,
            height: 220,
            colorDark: "#11120f",
            colorLight: "#ffffff",
            correctLevel: window.QRCode.CorrectLevel.H
          });
          el.qrtoolOutputWrap.classList.remove("hidden");
        } else {
          toast("QR library did not load. Please try again.", "error");
        }
      }

      function downloadQrToolPng() {
        var canvas = el.qrtoolOutput.querySelector("canvas");
        if (!canvas) return toast("Generate a QR code first.", "error");
        var link = document.createElement("a");
        link.download = "qr-code.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
      }

      async function showQr(code, link) {
        state.qrCode = code;
        el.qrCodeText.textContent = code;
        el.qrLinkInput.value = link;
        el.qrOutput.textContent = "";

        try {
          await ensureScript("https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js", "QRCode");
        } catch (error) {}

        if (typeof window.QRCode === "function") {
          new window.QRCode(el.qrOutput, {
            text: link + (link.indexOf("?") === -1 ? "?via=qr" : "&via=qr"),
            width: 220,
            height: 220,
            colorDark: "#11120f",
            colorLight: "#ffffff",
            correctLevel: window.QRCode.CorrectLevel.H
          });
        } else {
          var message = document.createElement("p");
          message.className = "py-12 text-center text-sm text-neutral-600";
          message.textContent = "QR library did not load. Copy the link below instead.";
          el.qrOutput.appendChild(message);
        }

        el.qrModal.classList.remove("hidden");
        el.qrModal.classList.add("flex");
        el.qrModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();
      }

      function closeQrModal() {
        el.qrModal.classList.add("hidden");
        el.qrModal.classList.remove("flex");
        el.qrModal.setAttribute("aria-hidden", "true");
        unlockBodyScrollIfClear();
      }

      async function openScanner() {
        el.scannerModal.classList.remove("hidden");
        el.scannerModal.classList.add("flex");
        el.scannerModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();
        el.scannerStatus.textContent = "Starting camera…";

        try {
          await ensureScript("https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js", "Html5Qrcode");
        } catch (error) {}

        if (typeof window.Html5Qrcode !== "function") {
          el.scannerStatus.textContent = "Scanner library did not load. Enter the code manually.";
          return;
        }

        if (state.scannerRunning) return;

        try {
          state.scanner = new window.Html5Qrcode("qr-reader");
          state.scannerRunning = true;
          await state.scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
            function (decodedText) { handleScannedValue(decodedText); },
            function () {}
          );
          el.scannerStatus.textContent = "Point the camera at the QR code.";
        } catch (error) {
          console.error(error);
          state.scannerRunning = false;
          el.scannerStatus.textContent = "Camera could not start. Check permission or enter the code manually.";
        }
      }

      async function closeScanner() {
        if (state.scanner && state.scannerRunning) {
          try { await state.scanner.stop(); } catch (error) { console.warn(error); }
          try { await state.scanner.clear(); } catch (error) { console.warn(error); }
        }
        state.scanner = null;
        state.scannerRunning = false;
        document.getElementById("qr-reader").textContent = "";
        el.scannerModal.classList.add("hidden");
        el.scannerModal.classList.remove("flex");
        el.scannerModal.setAttribute("aria-hidden", "true");
        unlockBodyScrollIfClear();
      }

      async function handleScannedValue(decodedText) {
        var scanned = extractCodeFromScan(decodedText);
        if (!scanned.code) {
          el.scannerStatus.textContent = "That QR does not contain a valid share code.";
          return;
        }
        await closeScanner();
        if (scanned.kind === "file") {
          openFileShareByCode(scanned.code, true, "qr");
        } else if (scanned.kind === "note") {
          openShareByCode(scanned.code, true, "qr");
        } else {
          openAnyShareByCode(scanned.code, true, "qr");
        }
      }

      function ensureScript(src, globalName) {
        if (window[globalName]) return Promise.resolve();
        return new Promise(function (resolve, reject) {
          var existing = document.querySelector('script[data-airtext-src="' + src + '"]');
          if (existing) {
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", reject, { once: true });
            return;
          }
          var script = document.createElement("script");
          script.src = src;
          script.async = true;
          script.setAttribute("data-airtext-src", src);
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      function extractCodeFromScan(value) {
        var text = String(value || "").trim();
        try {
          var parsed = new URL(text, window.location.origin);
          var noteMatch = parsed.pathname.match(/^\/s\/([A-Za-z0-9]{4,12})\/?$/);
          if (noteMatch) return { code: normalizeCode(noteMatch[1]), kind: "note" };
          var fileMatch = parsed.pathname.match(/^\/f\/([A-Za-z0-9]{4,12})\/?$/);
          if (fileMatch) return { code: normalizeCode(fileMatch[1]), kind: "file" };
        } catch (error) {}
        var plain = normalizeCode(text);
        return { code: plain.length >= 4 ? plain : "", kind: "unknown" };
      }

      function applyPublicSettings() {
        var disabled = APP.maintenanceMode || !APP.notesEnabled || !APP.createSectionEnabled;
        var textMap = {
          "header-create-text": "headerCreateText",
          "header-available-text": "headerAvailableText",
          "header-open-code-text": "headerOpenCodeText",
          "header-guide-text": "headerGuideText",
          "header-feedback-text": "headerFeedbackText",
          "header-about-text": "headerAboutText",
          "header-new-note-text": "headerNewNoteText",
          "drawer-create-text": "drawerCreateText",
          "drawer-open-code-text": "drawerOpenCodeText",
          "drawer-scan-text": "drawerScanText",
          "announcement-label": "announcementLabel",
          "announcement-text": "announcement",
          "hero-eyebrow": "heroEyebrow",
          "hero-title-primary": "heroTitlePrimary",
          "hero-title-outline": "heroTitleOutline",
          "hero-description": "heroDescription",
          "hero-primary-button": "heroPrimaryButtonText",
          "hero-secondary-button": "heroSecondaryButtonText",
          "hero-panel-eyebrow": "heroPanelEyebrow",
          "hero-panel-title": "heroPanelTitle",
          "hero-panel-text": "heroPanelText",
          "hero-panel-step1": "heroPanelStep1",
          "hero-panel-step2": "heroPanelStep2",
          "hero-panel-step3": "heroPanelStep3",
          "hero-stat1-value": "heroPanelStat1Value",
          "hero-stat1-label": "heroPanelStat1Label",
          "hero-stat2-value": "heroPanelStat2Value",
          "hero-stat2-label": "heroPanelStat2Label",
          "create-section-title": "createSectionTitle",
          "create-temporary-badge": "createTemporaryBadge",
          "create-privacy-note": "createPrivacyNote",
          "pin-toggle-text": "pinToggleText",
          "available-title": "availableTitle",
          "available-empty-text": "availableEmptyText",
          "open-code-title": "openCodeTitle",
          "open-code-button-text": "openCodeButtonText",
          "scan-qr-text": "scanQrText",
          "guide-eyebrow": "guideEyebrow",
          "guide-title": "guideTitle",
          "guide-step1-title": "guideStep1Title",
          "guide-step1-text": "guideStep1Text",
          "guide-step2-title": "guideStep2Title",
          "guide-step2-text": "guideStep2Text",
          "guide-step3-title": "guideStep3Title",
          "guide-step3-text": "guideStep3Text",
          "guide-step4-title": "guideStep4Title",
          "guide-step4-text": "guideStep4Text",
          "feedback-eyebrow": "feedbackEyebrow",
          "feedback-title": "feedbackTitle",
          "feedback-intro": "feedbackIntro",
          "about-eyebrow": "aboutEyebrow",
          "about-title": "aboutTitle",
          "about-text": "aboutText",
          "developer-name": "developerName",
          "developer-role": "developerRole",
          "developer-bio": "developerBio",
          "footer-tagline": "footerTagline",
          "footer-explore-title": "footerExploreTitle",
          "footer-information-title": "footerInformationTitle",
          "footer-connect-title": "footerConnectTitle",
          "footer-create-text": "footerCreateText",
          "footer-available-text": "footerAvailableText",
          "footer-open-code-text": "footerOpenCodeText",
          "footer-guide-text": "footerGuideText",
          "footer-feedback-text": "footerFeedbackText",
          "footer-about-text": "footerAboutText",
          "footer-developer-name": "developerName",
          "privacy-text": "privacyText",
          "admin-link-text": "adminLinkText",
          "maintenance-eyebrow": "maintenanceEyebrow",
          "maintenance-title": "maintenanceTitle",
          "maintenance-message": "maintenanceMessage",
          "maintenance-button": "maintenanceButtonText",
          "header-files-text": "headerFilesText",
          "header-qrtool-text": "headerQrToolText",
          "files-section-title": "filesSectionTitle",
          "files-temporary-badge": "filesTemporaryBadge",
          "files-privacy-note": "filesPrivacyNote",
          "files-available-title": "filesAvailableTitle",
          "files-empty-text": "filesEmptyText",
          "files-drop-hint": "filesDropHint",
          "files-upload-button-text": "filesUploadButtonText",
          "qrtool-eyebrow": "qrLinkToolEyebrow",
          "qrtool-title": "qrLinkToolTitle",
          "qrtool-subtitle": "qrLinkToolSubtitle",
          "qrtool-button-text": "qrLinkToolButtonText",
          "qrtool-download-text": "qrLinkToolDownloadText"
        };
        Object.keys(textMap).forEach(function (id) {
          setNodeText(id, APP[textMap[id]]);
        });

        document.querySelectorAll('[data-ticker-item="1"]').forEach(function (node) { node.textContent = APP.tickerItem1; });
        document.querySelectorAll('[data-ticker-item="2"]').forEach(function (node) { node.textContent = APP.tickerItem2; });
        document.querySelectorAll('[data-ticker-item="3"]').forEach(function (node) { node.textContent = APP.tickerItem3; });
        document.querySelectorAll('[data-ticker-item="4"]').forEach(function (node) { node.textContent = APP.tickerItem4; });

        el.shareTitle.placeholder = APP.createTitlePlaceholder;
        el.shareText.placeholder = APP.createTextPlaceholder;
        el.notesSearch.placeholder = APP.availableSearchPlaceholder;
        el.joinCode.placeholder = APP.openCodePlaceholder;
        el.feedbackMessage.placeholder = APP.feedbackMessagePlaceholder;
        el.feedbackEmail.placeholder = APP.feedbackEmailPlaceholder;
        el.fileTitle.placeholder = APP.filesUploadPlaceholder;
        el.qrtoolInput.placeholder = APP.qrLinkToolPlaceholder;
        var createLabel = el.createSubmit.querySelector("[data-button-label]");
        if (createLabel) createLabel.textContent = APP.createButtonText;
        el.feedbackSubmit.textContent = APP.feedbackButtonText;
        el.createExpiryCopy.textContent = String(APP.createSectionSubtitle || "")
          .replace("{duration}", formatDuration(APP.ttlSeconds));
        var filesSubtitle = document.getElementById("files-section-subtitle");
        if (filesSubtitle) {
          filesSubtitle.textContent = String(APP.filesSectionSubtitle || "")
            .replace("{duration}", formatDuration(APP.fileTtlSeconds || APP.ttlSeconds));
        }
        var filesDropHint = document.getElementById("files-drop-hint");
        if (filesDropHint) {
          filesDropHint.textContent = (APP.filesDropHint || "Drag and drop a file here, or click to choose one.")
            + " (max " + (APP.maxFileSizeMB || 25) + "MB)";
        }

        setSectionVisibility("announcement-bar", APP.announcementEnabled);
        setSectionVisibility("hero-section", APP.heroEnabled);
        setSectionVisibility("hero-panel", APP.heroEnabled && APP.heroPanelEnabled);
        setSectionVisibility("ticker-section", APP.tickerEnabled);
        setSectionVisibility("create-card", APP.createSectionEnabled);
        setSectionVisibility("create-privacy-note", APP.createSectionEnabled);
        setSectionVisibility("notes-section", APP.availableSectionEnabled);
        setSectionVisibility("join-card", APP.openCodeSectionEnabled);
        setSectionVisibility("files-card", APP.fileSharingEnabled);
        setSectionVisibility("header-files-text", APP.fileSharingEnabled);
        setSectionVisibility("qrtool-drawer-section", APP.qrLinkToolEnabled);
        setSectionVisibility("header-qrtool-text", APP.qrLinkToolEnabled);
        setSectionVisibility("guide-drawer-section", APP.guideEnabled);
        setSectionVisibility("feedback-drawer-section", APP.feedbackEnabled);
        setSectionVisibility("about-drawer-section", APP.aboutEnabled);
        setSectionVisibility("site-footer", APP.footerEnabled);
        setSectionVisibility("header-guide-text", APP.guideEnabled);
        setSectionVisibility("header-feedback-text", APP.feedbackEnabled);
        setSectionVisibility("header-about-text", APP.aboutEnabled);
        setSectionVisibility("header-create-text", APP.createSectionEnabled);
        setSectionVisibility("header-available-text", APP.availableSectionEnabled);
        setSectionVisibility("header-open-code-text", APP.openCodeSectionEnabled);
        setSectionVisibility("header-new-note-text", APP.createSectionEnabled);
        setSectionVisibility("hero-primary-button", APP.createSectionEnabled);
        setSectionVisibility("hero-secondary-button", APP.openCodeSectionEnabled);
        setSectionVisibility("drawer-create-text", APP.createSectionEnabled);
        setSectionVisibility("drawer-open-code-text", APP.openCodeSectionEnabled);
        setSectionVisibility("drawer-scan-text", APP.openCodeSectionEnabled);
        setSectionVisibility("footer-create-text", APP.createSectionEnabled);
        setSectionVisibility("footer-available-text", APP.availableSectionEnabled);
        setSectionVisibility("footer-open-code-text", APP.openCodeSectionEnabled);
        setSectionVisibility("footer-guide-text", APP.guideEnabled);
        setSectionVisibility("footer-feedback-text", APP.feedbackEnabled);
        setSectionVisibility("footer-about-text", APP.aboutEnabled);

        renderSocialLinks();
        var year = APP.footerShowYear ? new Date().getFullYear() + " " : "";
        setNodeText("footer-copyright", "© " + year + APP.appName + ". " + APP.footerRightsText);
        var developerLine = document.getElementById("footer-developer-line");
        if (developerLine) {
          developerLine.classList.toggle("hidden", !APP.footerShowDeveloper);
          developerLine.textContent = APP.footerDeveloperPrefix + " ";
          var strong = document.createElement("strong");
          strong.textContent = APP.developerName;
          developerLine.appendChild(strong);
        }

        el.maintenanceBanner.classList.toggle("hidden", !APP.maintenanceMode);
        el.createSubmit.disabled = disabled;
        el.createSubmit.setAttribute("aria-disabled", disabled ? "true" : "false");
        if (disabled) {
          if (createLabel) createLabel.textContent = "New notes disabled";
        }
        var filesDisabled = APP.maintenanceMode || !APP.fileSharingEnabled;
        el.fileUploadSubmit.disabled = filesDisabled;
        el.fileUploadSubmit.setAttribute("aria-disabled", filesDisabled ? "true" : "false");
        var filesLabel = el.fileUploadSubmit.querySelector("[data-button-label]");
        if (filesLabel) filesLabel.textContent = filesDisabled ? "File sharing disabled" : APP.filesUploadButtonText;
        el.fileLockToggle && (el.fileLockToggle.closest("label").classList.toggle("hidden", !APP.pinEnabled));
        if (!APP.pinEnabled) {
          el.fileLockToggle.checked = false;
          el.filePinFieldWrap.classList.add("hidden");
        }
        el.lockControl.classList.toggle("hidden", !APP.pinEnabled);
        if (!APP.pinEnabled) {
          el.lockToggle.checked = false;
          el.pinFieldWrap.classList.add("hidden");
        }
        el.feedbackSection.classList.toggle("hidden", !APP.feedbackEnabled);
        if (APP.maintenanceMode) {
          document.getElementById("maintenance-modal").classList.remove("hidden-force");
          lockBodyScroll();
        }
      }

      function setNodeText(id, value) {
        var node = document.getElementById(id);
        if (node) node.textContent = String(value == null ? "" : value);
      }

      function setSectionVisibility(id, visible) {
        var node = document.getElementById(id);
        if (node) node.classList.toggle("hidden-force", !visible);
      }

      function renderSocialLinks() {
        var entries = [
          ["Facebook", APP.socialFacebook],
          ["Instagram", APP.socialInstagram],
          ["X", APP.socialX],
          ["LinkedIn", APP.socialLinkedIn],
          ["GitHub", APP.socialGitHub],
          ["YouTube", APP.socialYouTube]
        ].filter(function (entry) { return safeExternalUrl(entry[1]); });
        ["footer-social-links", "drawer-social-links"].forEach(function (id) {
          var container = document.getElementById(id);
          if (!container) return;
          container.textContent = "";
          entries.forEach(function (entry) {
            var link = document.createElement("a");
            link.className = "social-link";
            link.href = safeExternalUrl(entry[1]);
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = entry[0];
            container.appendChild(link);
          });
        });
        setSectionVisibility("footer-social-column", APP.socialLinksEnabled && entries.length > 0);
        setSectionVisibility("drawer-social-links", APP.socialLinksEnabled && entries.length > 0);

        var contacts = document.getElementById("developer-contact-links");
        if (contacts) {
          contacts.textContent = "";
          var website = safeExternalUrl(APP.developerWebsite);
          if (website) contacts.appendChild(createContactLink("Website", website));
          if (isEmailAddress(APP.developerEmail)) {
            contacts.appendChild(createContactLink("Email", "mailto:" + APP.developerEmail));
          }
        }
      }

      function createContactLink(label, href) {
        var link = document.createElement("a");
        link.className = "social-link";
        link.href = href;
        link.target = href.indexOf("mailto:") === 0 ? "_self" : "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = label;
        return link;
      }

      function safeExternalUrl(value) {
        var raw = String(value || "").trim();
        if (!raw) return "";
        try {
          var candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw;
          var parsed = new URL(candidate);
          return /^(?:https?:)$/i.test(parsed.protocol) ? parsed.href : "";
        } catch (error) {
          return "";
        }
      }

      function toggleTheme() {
        var current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
        var next = current === "light" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("airtext_theme", next);
        syncThemeButtons();
      }

      function syncThemeButtons() {
        var theme = document.documentElement.getAttribute("data-theme") || "dark";
        document.querySelectorAll('[data-action="toggle-theme"]').forEach(function (button) {
          button.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
          button.setAttribute("title", theme === "light" ? "Dark mode" : "Light mode");
        });
      }

      function openDrawer(targetId) {
        el.drawer.classList.add("open");
        el.drawerBackdrop.classList.add("open");
        el.drawer.setAttribute("aria-hidden", "false");
        lockBodyScroll();
        if (targetId) {
          window.setTimeout(function () {
            var target = document.getElementById(targetId);
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 180);
        }
      }

      function closeDrawer() {
        el.drawer.classList.remove("open");
        el.drawerBackdrop.classList.remove("open");
        el.drawer.setAttribute("aria-hidden", "true");
        unlockBodyScrollIfClear();
      }

      async function submitFeedback(event) {
        event.preventDefault();
        var message = el.feedbackMessage.value.trim();
        if (message.length < 5) return fieldError(el.feedbackMessage, "Please add a little more detail.");

        el.feedbackSubmit.disabled = true;
        el.feedbackSubmit.textContent = "Submitting…";
        try {
          var response = await apiFetch("/api/feedback", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              category: el.feedbackCategory.value,
              message: message,
              email: el.feedbackEmail.value.trim(),
              rating: Number(el.feedbackRating.value || 0)
            })
          });
          el.feedbackForm.reset();
          toast(response.message || "Thank you for the feedback.", "success");
        } catch (error) {
          toast(error.message || "Unable to submit feedback.", "error");
        } finally {
          el.feedbackSubmit.disabled = false;
          el.feedbackSubmit.textContent = APP.feedbackButtonText;
        }
      }

      async function initAdmin() {
        try {
          var session = await apiFetch("/api/admin/session");
          if (!session.configured) {
            el.adminLoginHelp.textContent = "Admin is disabled. Add an ADMIN_PASSWORD Worker secret with at least 8 characters, then refresh this page.";
            el.adminPassword.disabled = true;
            el.adminLoginSubmit.disabled = true;
            return;
          }
          if (session.authenticated) {
            showAdminDashboard();
            await loadAdminDashboard();
          } else {
            el.adminPassword.focus();
          }
        } catch (error) {
          el.adminLoginHelp.textContent = error.message || "Unable to check the administrator session.";
        }
      }

      async function adminLogin(event) {
        event.preventDefault();
        var password = el.adminPassword.value;
        if (!password) return fieldError(el.adminPassword, "Enter the administrator password.");
        el.adminLoginSubmit.disabled = true;
        el.adminLoginSubmit.textContent = "Signing in…";
        try {
          await apiFetch("/api/admin/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password: password })
          });
          el.adminPassword.value = "";
          showAdminDashboard();
          await loadAdminDashboard();
          toast("Signed in.", "success");
        } catch (error) {
          toast(error.message || "Unable to sign in.", "error");
          el.adminPassword.select();
        } finally {
          el.adminLoginSubmit.disabled = false;
          el.adminLoginSubmit.textContent = "Sign in";
        }
      }

      async function adminLogout() {
        try {
          await apiFetch("/api/admin/logout", { method: "POST" });
        } catch (error) {}
        state.adminData = null;
        el.adminDashboard.classList.add("hidden");
        el.adminLoginCard.classList.remove("hidden");
        el.adminLogout.classList.add("hidden");
        el.adminPassword.focus();
        toast("Signed out.", "success");
      }

      function showAdminDashboard() {
        el.adminLoginCard.classList.add("hidden");
        el.adminDashboard.classList.remove("hidden");
        el.adminLogout.classList.remove("hidden");
        switchAdminTab("overview");
      }

      function switchAdminTab(tabName) {
        el.adminTabs.forEach(function (tab) {
          var active = tab.getAttribute("data-admin-tab") === tabName;
          tab.classList.toggle("active", active);
          tab.setAttribute("aria-selected", active ? "true" : "false");
        });
        el.adminTabPanels.forEach(function (panel) {
          panel.classList.toggle("hidden", panel.getAttribute("data-admin-panel") !== tabName);
        });
      }

      async function loadAdminDashboard() {
        el.adminRefresh.disabled = true;
        el.adminRefresh.textContent = "Refreshing…";
        try {
          var data = await adminFetch("/api/admin/dashboard");
          state.adminData = data;
          renderAdminDashboard(data);
        } catch (error) {
          if (error.status === 401) {
            el.adminDashboard.classList.add("hidden");
            el.adminLoginCard.classList.remove("hidden");
            el.adminLogout.classList.add("hidden");
          }
          toast(error.message || "Unable to load dashboard.", "error");
        } finally {
          el.adminRefresh.disabled = false;
          el.adminRefresh.textContent = "Refresh data";
        }
      }

      function renderAdminDashboard(data) {
        if (el.adminStorageStatus) {
          el.adminStorageStatus.textContent = data.storage && data.storage.primary === "D1"
            ? "D1 primary storage · 0 routine KV writes"
            : "Storage status unavailable";
        }
        renderAdminStats(data.stats || {});
        renderAdminChart(data.chart || []);
        renderAdminEventCounts(data.eventCounts || {});
        renderAdminNotes(data.notes || []);
        renderAdminFeedback(data.feedback || []);
        renderAdminFiles(data.files || [], data.storage || {});
        fillAdminSettings(data.settings || {});
      }

      function renderAdminStats(stats) {
        var cards = [
          ["Active notes", stats.activeNotes || 0],
          ["Created notes", stats.createdNotes || 0],
          ["Note opens", stats.noteOpens || 0],
          ["Unique networks", stats.uniqueNetworks || 0],
          ["Received opens", stats.receivedOpens || 0],
          ["New feedback", stats.feedbackNew || 0],
          ["Total feedback", stats.feedbackTotal || 0],
          ["Failed PINs", stats.pinFailures || 0]
        ];
        el.adminStats.textContent = "";
        cards.forEach(function (card) {
          var node = document.createElement("article");
          node.className = "stat-card";
          var label = document.createElement("p");
          label.className = "text-xs font-semibold uppercase tracking-wider text-slate-500";
          label.textContent = card[0];
          var value = document.createElement("p");
          value.className = "stat-value";
          value.textContent = Number(card[1]).toLocaleString();
          node.appendChild(label);
          node.appendChild(value);
          el.adminStats.appendChild(node);
        });
      }

      function renderAdminChart(chart) {
        el.adminChart.textContent = "";
        var maximum = Math.max.apply(Math, chart.map(function (entry) { return Number(entry.count || 0); }).concat([1]));
        chart.forEach(function (entry) {
          var column = document.createElement("div");
          column.className = "bar-column";
          var count = document.createElement("strong");
          count.textContent = String(entry.count || 0);
          var fill = document.createElement("span");
          fill.className = "bar-fill";
          fill.style.height = Math.max(4, Math.round((Number(entry.count || 0) / maximum) * 135)) + "px";
          var date = document.createElement("span");
          date.textContent = new Date(entry.date + "T00:00:00").toLocaleDateString([], { weekday: "short" });
          column.appendChild(count);
          column.appendChild(fill);
          column.appendChild(date);
          el.adminChart.appendChild(column);
        });
      }

      function renderAdminEventCounts(counts) {
        var labels = {
          note_created: "Notes created",
          note_opened: "Local opens",
          shared_note_opened: "Link, QR and code opens",
          pin_unlocked: "Successful PIN unlocks",
          pin_failed: "Failed PIN attempts",
          note_deleted: "Notes deleted",
          feedback_submitted: "Feedback submitted",
          settings_updated: "Settings updates",
          admin_login: "Admin logins",
          admin_login_failed: "Failed admin logins"
        };
        var keys = Object.keys(counts).sort(function (a, b) { return Number(counts[b]) - Number(counts[a]); });
        el.adminEventCounts.textContent = "";
        if (!keys.length) {
          el.adminEventCounts.textContent = "No analytics events yet.";
          return;
        }
        keys.forEach(function (key) {
          var row = document.createElement("div");
          row.className = "flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3";
          var label = document.createElement("span");
          label.textContent = labels[key] || key.replace(/_/g, " ");
          var value = document.createElement("strong");
          value.textContent = Number(counts[key]).toLocaleString();
          row.appendChild(label);
          row.appendChild(value);
          el.adminEventCounts.appendChild(row);
        });
      }

      function renderAdminNotes(notes) {
        el.adminNotes.textContent = "";
        if (!notes.length) {
          el.adminNotes.textContent = "No active notes.";
          return;
        }
        notes.forEach(function (item) {
          var row = document.createElement("div");
          row.className = "admin-list-row";
          var body = document.createElement("div");
          body.className = "min-w-0";
          var title = document.createElement("strong");
          title.className = "block truncate";
          title.textContent = item.title;
          var meta = document.createElement("p");
          meta.className = "mt-1 text-xs text-slate-500";
          meta.textContent = item.code + " · " + (item.locked ? "PIN locked" : "Open") + " · " + formatRemaining(item.expiresAt);
          body.appendChild(title);
          body.appendChild(meta);
          var button = document.createElement("button");
          button.type = "button";
          button.className = "rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-300";
          button.setAttribute("data-action", "admin-delete-note");
          button.setAttribute("data-admin-item-id", item.id);
          button.textContent = "Delete";
          row.appendChild(body);
          row.appendChild(button);
          el.adminNotes.appendChild(row);
        });
      }

      function renderAdminFiles(files, storage) {
        if (el.adminStorageFill && el.adminStorageLabel) {
          var used = Number((storage && storage.fileStorageBytes) || 0);
          var cap = Number((storage && storage.fileStorageLimitBytes) || 1);
          var pct = Math.min(100, Math.round((used / cap) * 100));
          el.adminStorageFill.style.width = pct + "%";
          el.adminStorageLabel.textContent = formatBytes(used) + " used of " + formatBytes(cap) + " (" + pct + "%)";
          if (el.adminStorageWarning) {
            if (!storage || !storage.filesBucketConfigured) {
              el.adminStorageWarning.textContent = "No R2 bucket bound as FILES_BUCKET yet — file sharing will return an error until one is added in Cloudflare.";
              el.adminStorageWarning.classList.remove("hidden");
            } else if (pct >= 90) {
              el.adminStorageWarning.textContent = "Storage is nearly full. Raise the cap or clear old files below.";
              el.adminStorageWarning.classList.remove("hidden");
            } else {
              el.adminStorageWarning.classList.add("hidden");
            }
          }
        }
        if (!el.adminFiles) return;
        el.adminFiles.textContent = "";
        if (!files.length) {
          el.adminFiles.textContent = "No active files.";
          return;
        }
        files.forEach(function (item) {
          var row = document.createElement("div");
          row.className = "admin-list-row";
          var body = document.createElement("div");
          body.className = "min-w-0";
          var title = document.createElement("strong");
          title.className = "block truncate";
          title.textContent = item.title;
          var meta = document.createElement("p");
          meta.className = "mt-1 text-xs text-slate-500";
          meta.textContent = item.code + " · " + formatBytes(item.sizeBytes) + " · "
            + (item.locked ? "PIN locked" : "Open") + " · " + item.downloadCount + " downloads · "
            + formatRemaining(item.expiresAt);
          body.appendChild(title);
          body.appendChild(meta);
          var button = document.createElement("button");
          button.type = "button";
          button.className = "rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-300";
          button.setAttribute("data-action", "admin-delete-file");
          button.setAttribute("data-admin-file-id", item.id);
          button.textContent = "Delete";
          row.appendChild(body);
          row.appendChild(button);
          el.adminFiles.appendChild(row);
        });
      }

      function formatBytes(bytes) {
        var value = Number(bytes) || 0;
        if (value < 1024) return value + " B";
        if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
        if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
        return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
      }

      function renderAdminFeedback(feedback) {
        el.adminFeedback.textContent = "";
        if (!feedback.length) {
          el.adminFeedback.textContent = "No feedback submitted yet.";
          return;
        }
        feedback.forEach(function (item) {
          var row = document.createElement("article");
          row.className = "border-b border-[var(--line)] py-4 first:pt-0 last:border-0 last:pb-0";
          var top = document.createElement("div");
          top.className = "flex flex-wrap items-center justify-between gap-2";
          var label = document.createElement("strong");
          label.textContent = String(item.category || "other") + (item.rating ? " · " + item.rating + "/5" : "");
          var status = document.createElement("span");
          status.className = "note-badge";
          status.textContent = item.status || "new";
          top.appendChild(label);
          top.appendChild(status);
          var message = document.createElement("p");
          message.className = "mt-3 whitespace-pre-wrap text-sm leading-6";
          message.textContent = item.message || "";
          var details = document.createElement("p");
          details.className = "mt-2 text-xs text-slate-500";
          details.textContent = (item.email || "No email") + " · " + formatDate(item.createdAt);
          var actions = document.createElement("div");
          actions.className = "mt-3 flex flex-wrap gap-2";
          ["new", "reviewed", "resolved"].forEach(function (nextStatus) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "rounded-md border border-[var(--line)] px-3 py-1.5 text-xs";
            button.setAttribute("data-action", "admin-feedback-status");
            button.setAttribute("data-feedback-id", item.id);
            button.setAttribute("data-feedback-status", nextStatus);
            button.disabled = item.status === nextStatus;
            button.textContent = nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1);
            actions.appendChild(button);
          });
          var remove = document.createElement("button");
          remove.type = "button";
          remove.className = "rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-300";
          remove.setAttribute("data-action", "admin-delete-feedback");
          remove.setAttribute("data-feedback-id", item.id);
          remove.textContent = "Delete";
          actions.appendChild(remove);
          row.appendChild(top);
          row.appendChild(message);
          row.appendChild(details);
          row.appendChild(actions);
          el.adminFeedback.appendChild(row);
        });
      }

      function fillAdminSettings(settings) {
        el.settingAppName.value = settings.appName || "";
        el.settingTagline.value = settings.tagline || "";
        el.settingAnnouncement.value = settings.announcement || "";
        el.settingTtl.value = Math.round(Number(settings.ttlSeconds || 3600) / 60);
        el.settingMaxItems.value = settings.maxLocalItems || 50;
        el.settingTitleLength.value = settings.maxTitleLength || 80;
        el.settingTextLength.value = settings.maxTextLength || 10000;
        el.settingCreateCooldown.value = settings.createCooldownSeconds || 3;
        el.settingUnlockCooldown.value = settings.unlockCooldownSeconds || 2;
        el.settingDefaultTheme.value = settings.defaultTheme || "system";
        el.settingNotesEnabled.checked = Boolean(settings.notesEnabled);
        el.settingPinEnabled.checked = Boolean(settings.pinEnabled);
        el.settingCrossNetwork.checked = Boolean(settings.crossNetworkAddEnabled);
        el.settingFeedbackEnabled.checked = Boolean(settings.feedbackEnabled);
        el.settingAnalyticsEnabled.checked = Boolean(settings.analyticsEnabled);
        el.settingMaintenance.checked = Boolean(settings.maintenanceMode);
        el.settingHeroEnabled.checked = Boolean(settings.heroEnabled);
        el.settingHeroPanelEnabled.checked = Boolean(settings.heroPanelEnabled);
        el.settingAnnouncementEnabled.checked = Boolean(settings.announcementEnabled);
        el.settingTickerEnabled.checked = Boolean(settings.tickerEnabled);
        el.settingCreateSectionEnabled.checked = Boolean(settings.createSectionEnabled);
        el.settingAvailableSectionEnabled.checked = Boolean(settings.availableSectionEnabled);
        el.settingOpenCodeSectionEnabled.checked = Boolean(settings.openCodeSectionEnabled);
        el.settingGuideEnabled.checked = Boolean(settings.guideEnabled);
        el.settingAboutEnabled.checked = Boolean(settings.aboutEnabled);
        el.settingFooterEnabled.checked = Boolean(settings.footerEnabled);
        el.settingSocialLinksEnabled.checked = Boolean(settings.socialLinksEnabled);
        el.settingFooterShowYear.checked = Boolean(settings.footerShowYear);
        el.settingFooterShowDeveloper.checked = Boolean(settings.footerShowDeveloper);
        renderAdminContentFields(settings);
      }

      function renderAdminContentFields(settings) {
        var groups = [
          ["Header labels", [
            ["headerCreateText", "Create link"], ["headerAvailableText", "Available link"],
            ["headerOpenCodeText", "Open-code link"], ["headerGuideText", "Guide link"],
            ["headerFeedbackText", "Feedback link"], ["headerAboutText", "About link"],
            ["headerNewNoteText", "New-note button"], ["drawerCreateText", "Drawer create button"],
            ["drawerOpenCodeText", "Drawer open-code button"], ["drawerScanText", "Drawer QR button"]
          ]],
          ["Hero section", [
            ["heroEyebrow", "Eyebrow"], ["heroTitlePrimary", "Main title"],
            ["heroTitleOutline", "Outlined title"], ["heroDescription", "Description", "textarea"],
            ["heroPrimaryButtonText", "Primary button"], ["heroSecondaryButtonText", "Secondary button"],
            ["heroPanelEyebrow", "Panel eyebrow"], ["heroPanelTitle", "Panel title"],
            ["heroPanelText", "Panel description", "textarea"], ["heroPanelStep1", "Flow step 1"],
            ["heroPanelStep2", "Flow step 2"], ["heroPanelStep3", "Flow step 3"],
            ["heroPanelStat1Value", "Stat 1 value"], ["heroPanelStat1Label", "Stat 1 label"],
            ["heroPanelStat2Value", "Stat 2 value"], ["heroPanelStat2Label", "Stat 2 label"]
          ]],
          ["Announcement and ticker", [
            ["announcementLabel", "Announcement badge"],
            ["tickerItem1", "Ticker item 1"], ["tickerItem2", "Ticker item 2"],
            ["tickerItem3", "Ticker item 3"], ["tickerItem4", "Ticker item 4"]
          ]],
          ["Create and available notes", [
            ["createSectionTitle", "Create heading"], ["createSectionSubtitle", "Create subtitle"],
            ["createTitlePlaceholder", "Title placeholder"], ["createTextPlaceholder", "Text placeholder"],
            ["createButtonText", "Save button"], ["createTemporaryBadge", "Temporary badge"],
            ["createPrivacyNote", "Privacy note", "textarea"], ["pinToggleText", "PIN toggle label"],
            ["availableTitle", "Available heading"],
            ["availableSearchPlaceholder", "Search placeholder"], ["availableEmptyText", "Empty message"],
            ["openCodeTitle", "Open-code heading"], ["openCodePlaceholder", "Code placeholder"],
            ["openCodeButtonText", "Open-code button"],
            ["scanQrText", "QR scanner button"]
          ]],
          ["Guide and feedback", [
            ["guideEyebrow", "Guide eyebrow"], ["guideTitle", "Guide heading"],
            ["guideStep1Title", "Step 1 title"], ["guideStep1Text", "Step 1 text", "textarea"],
            ["guideStep2Title", "Step 2 title"], ["guideStep2Text", "Step 2 text", "textarea"],
            ["guideStep3Title", "Step 3 title"], ["guideStep3Text", "Step 3 text", "textarea"],
            ["guideStep4Title", "Step 4 title"], ["guideStep4Text", "Step 4 text", "textarea"],
            ["feedbackEyebrow", "Feedback eyebrow"], ["feedbackTitle", "Feedback heading"],
            ["feedbackIntro", "Feedback introduction", "textarea"], ["feedbackButtonText", "Feedback button"]
          ]],
          ["About and developer", [
            ["aboutEyebrow", "About eyebrow"], ["aboutTitle", "About heading"],
            ["aboutText", "About description", "textarea"], ["developerName", "Developer name"],
            ["developerRole", "Developer role"], ["developerBio", "Developer bio", "textarea"],
            ["developerWebsite", "Developer website", "url"], ["developerEmail", "Developer email", "email"],
            ["privacyText", "Privacy statement", "textarea"], ["adminLinkText", "Admin link label"]
          ]],
          ["Footer, social and maintenance", [
            ["footerTagline", "Footer tagline"], ["footerExploreTitle", "Explore heading"],
            ["footerInformationTitle", "Information heading"], ["footerConnectTitle", "Connect heading"],
            ["footerCreateText", "Footer create link"], ["footerAvailableText", "Footer available link"],
            ["footerOpenCodeText", "Footer open-code link"], ["footerGuideText", "Footer guide link"],
            ["footerFeedbackText", "Footer feedback link"], ["footerAboutText", "Footer about link"],
            ["footerRightsText", "Rights text"],
            ["footerDeveloperPrefix", "Developer credit prefix"],
            ["socialFacebook", "Facebook URL", "url"], ["socialInstagram", "Instagram URL", "url"],
            ["socialX", "X URL", "url"], ["socialLinkedIn", "LinkedIn URL", "url"],
            ["socialGitHub", "GitHub URL", "url"], ["socialYouTube", "YouTube URL", "url"],
            ["maintenanceEyebrow", "Maintenance eyebrow"], ["maintenanceTitle", "Maintenance title"], ["maintenanceMessage", "Maintenance message", "textarea"],
            ["feedbackMessagePlaceholder", "Feedback message placeholder"],
            ["feedbackEmailPlaceholder", "Feedback email placeholder"],
            ["maintenanceButtonText", "Maintenance button"]
          ]],
          ["File sharing limits", [
            ["fileSharingEnabled", "Enable file sharing", "checkbox"],
            ["maxFileSizeMB", "Max file size (MB)", "number", 1, 200],
            ["maxTotalStorageMB", "Total storage cap (MB)", "number", 50, 20000],
            ["fileTtlSeconds", "File retention (seconds)", "number", 300, 604800],
            ["fileUploadCooldownSeconds", "Upload cooldown (seconds)", "number", 1, 120],
            ["maxActiveFiles", "Max active files per network", "number", 10, 2000],
            ["allowedFileExtensions", "Allowed extensions (comma-separated, blank = all)"],
            ["blockedFileExtensions", "Blocked extensions (comma-separated)"],
            ["headerFilesText", "Files nav link"], ["filesSectionTitle", "Files section heading"],
            ["filesSectionSubtitle", "Files section subtitle"],
            ["filesUploadPlaceholder", "Title placeholder"], ["filesUploadButtonText", "Upload button"],
            ["filesTemporaryBadge", "Temporary badge"], ["filesPrivacyNote", "Privacy note", "textarea"],
            ["filesAvailableTitle", "Available files heading"], ["filesEmptyText", "Empty message"],
            ["filesDropHint", "Drop-zone hint text"]
          ]],
          ["QR link generator", [
            ["qrLinkToolEnabled", "Enable standalone QR tool", "checkbox"],
            ["headerQrToolText", "Nav link label"], ["qrLinkToolEyebrow", "Eyebrow"],
            ["qrLinkToolTitle", "Heading"], ["qrLinkToolSubtitle", "Subtitle", "textarea"],
            ["qrLinkToolPlaceholder", "URL input placeholder"],
            ["qrLinkToolButtonText", "Generate button"], ["qrLinkToolDownloadText", "Download button"]
          ]],
          ["SEO", [
            ["seoEnabled", "Enable SEO tags", "checkbox"],
            ["seoSiteTitle", "Site title (<title> tag)"],
            ["seoMetaDescription", "Meta description", "textarea"],
            ["seoKeywords", "Keywords (comma-separated)", "textarea"],
            ["seoOgImageUrl", "Social share image URL", "url"],
            ["seoTwitterHandle", "Twitter/X handle"],
            ["seoCanonicalBaseUrl", "Canonical base URL (blank = auto-detect)", "url"],
            ["seoGoogleSiteVerification", "Google site verification code"],
            ["seoRobotsDirective", "Robots directive", "select", ["index, follow", "noindex, follow", "index, nofollow", "noindex, nofollow"]]
          ]]
        ];
        el.adminContentFields.textContent = "";
        groups.forEach(function (group) {
          var section = document.createElement("section");
          section.className = "content-field-group";
          var heading = document.createElement("h3");
          heading.className = "font-bold text-white";
          heading.textContent = group[0];
          var grid = document.createElement("div");
          grid.className = "content-field-grid";
          group[1].forEach(function (field) {
            var key = field[0], caption = field[1], type = field[2] || "text";
            var label = document.createElement("label");
            var input;
            if (type === "textarea") {
              input = document.createElement("textarea");
              input.rows = 3;
              input.maxLength = 1000;
              input.value = settings[key] == null ? "" : String(settings[key]);
              label.className = "grid gap-2 text-sm";
            } else if (type === "checkbox") {
              input = document.createElement("input");
              input.type = "checkbox";
              input.checked = Boolean(settings[key]);
              label.className = "setting-toggle";
            } else if (type === "number") {
              input = document.createElement("input");
              input.type = "number";
              if (field[3] != null) input.min = field[3];
              if (field[4] != null) input.max = field[4];
              input.value = settings[key] == null ? "" : String(settings[key]);
              input.className = "form-field";
              label.className = "grid gap-2 text-sm";
            } else if (type === "select") {
              input = document.createElement("select");
              (field[3] || []).forEach(function (optionValue) {
                var option = document.createElement("option");
                option.value = optionValue;
                option.textContent = optionValue;
                if (settings[key] === optionValue) option.selected = true;
                input.appendChild(option);
              });
              input.className = "form-field";
              label.className = "grid gap-2 text-sm";
            } else {
              input = document.createElement("input");
              input.type = type === "url" || type === "email" ? type : "text";
              input.maxLength = type === "url" ? 500 : 200;
              input.value = settings[key] == null ? "" : String(settings[key]);
              input.className = "form-field";
              label.className = "grid gap-2 text-sm";
            }
            input.setAttribute("data-setting-key", key);
            var captionNode = document.createElement("span");
            captionNode.textContent = caption;
            if (type === "checkbox") {
              label.appendChild(captionNode);
              label.appendChild(input);
            } else {
              label.appendChild(captionNode);
              label.appendChild(input);
            }
            grid.appendChild(label);
          });
          section.appendChild(heading);
          section.appendChild(grid);
          el.adminContentFields.appendChild(section);
        });
      }

      async function saveAdminSettings(event) {
        event.preventDefault();
        el.adminSettingsSubmit.disabled = true;
        el.adminSettingsSubmit.textContent = "Saving…";
        try {
          var payload = {
            appName: el.settingAppName.value.trim(),
            tagline: el.settingTagline.value.trim(),
            announcement: el.settingAnnouncement.value.trim(),
            ttlSeconds: Number(el.settingTtl.value) * 60,
            maxLocalItems: Number(el.settingMaxItems.value),
            maxTitleLength: Number(el.settingTitleLength.value),
            maxTextLength: Number(el.settingTextLength.value),
            createCooldownSeconds: Number(el.settingCreateCooldown.value),
            unlockCooldownSeconds: Number(el.settingUnlockCooldown.value),
            defaultTheme: el.settingDefaultTheme.value,
            notesEnabled: el.settingNotesEnabled.checked,
            pinEnabled: el.settingPinEnabled.checked,
            crossNetworkAddEnabled: el.settingCrossNetwork.checked,
            feedbackEnabled: el.settingFeedbackEnabled.checked,
            analyticsEnabled: el.settingAnalyticsEnabled.checked,
            maintenanceMode: el.settingMaintenance.checked,
            heroEnabled: el.settingHeroEnabled.checked,
            heroPanelEnabled: el.settingHeroPanelEnabled.checked,
            announcementEnabled: el.settingAnnouncementEnabled.checked,
            tickerEnabled: el.settingTickerEnabled.checked,
            createSectionEnabled: el.settingCreateSectionEnabled.checked,
            availableSectionEnabled: el.settingAvailableSectionEnabled.checked,
            openCodeSectionEnabled: el.settingOpenCodeSectionEnabled.checked,
            guideEnabled: el.settingGuideEnabled.checked,
            aboutEnabled: el.settingAboutEnabled.checked,
            footerEnabled: el.settingFooterEnabled.checked,
            socialLinksEnabled: el.settingSocialLinksEnabled.checked,
            footerShowYear: el.settingFooterShowYear.checked,
            footerShowDeveloper: el.settingFooterShowDeveloper.checked
          };
          el.adminContentFields.querySelectorAll("[data-setting-key]").forEach(function (input) {
            var key = input.getAttribute("data-setting-key");
            if (input.type === "checkbox") {
              payload[key] = input.checked;
            } else if (input.type === "number") {
              payload[key] = Number(input.value);
            } else {
              payload[key] = input.value.trim();
            }
          });
          await adminFetch("/api/admin/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          toast("Settings saved. Public pages will use them immediately.", "success");
          await loadAdminDashboard();
        } catch (error) {
          toast(error.message || "Unable to save settings.", "error");
        } finally {
          el.adminSettingsSubmit.disabled = false;
          el.adminSettingsSubmit.textContent = "Save settings";
        }
      }

      async function adminDeleteNote(itemId) {
        if (!window.confirm("Delete this active note now?")) return;
        try {
          await adminFetch("/api/admin/item/" + encodeURIComponent(itemId), { method: "DELETE" });
          toast("Note deleted.", "success");
          await loadAdminDashboard();
        } catch (error) {
          toast(error.message || "Unable to delete note.", "error");
        }
      }

      async function adminDeleteFile(fileId) {
        if (!window.confirm("Delete this file now?")) return;
        try {
          await adminFetch("/api/admin/file/" + encodeURIComponent(fileId), { method: "DELETE" });
          toast("File deleted.", "success");
          await loadAdminDashboard();
        } catch (error) {
          toast(error.message || "Unable to delete file.", "error");
        }
      }

      async function updateFeedbackStatus(feedbackId, status) {
        try {
          await adminFetch("/api/admin/feedback/" + encodeURIComponent(feedbackId), {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: status })
          });
          await loadAdminDashboard();
        } catch (error) {
          toast(error.message || "Unable to update feedback.", "error");
        }
      }

      async function deleteFeedback(feedbackId) {
        if (!window.confirm("Delete this feedback submission?")) return;
        try {
          await adminFetch("/api/admin/feedback/" + encodeURIComponent(feedbackId), { method: "DELETE" });
          toast("Feedback deleted.", "success");
          await loadAdminDashboard();
        } catch (error) {
          toast(error.message || "Unable to delete feedback.", "error");
        }
      }

      function adminFetch(url, options) {
        var config = Object.assign({}, options || {});
        config.headers = Object.assign({}, (options && options.headers) || {}, { "x-airtext-admin": "1" });
        return apiFetch(url, config);
      }

      async function apiFetch(url, options) {
        var response;
        try {
          var config = Object.assign({}, options || {});
          config.headers = Object.assign({ "accept": "application/json" }, (options && options.headers) || {});
          response = await fetch(url, config);
        } catch (error) {
          throw new Error("Network error. Check your connection and try again.");
        }

        var data = null;
        try { data = await response.json(); } catch (error) {}

        if (!response.ok || !data || data.ok === false) {
          var message = data && data.error ? data.error : "Request failed with status " + response.status + ".";
          var requestError = new Error(message);
          requestError.status = response.status;
          requestError.code = data && data.code;
          throw requestError;
        }

        return data;
      }

      function startPolling() {
        if (state.pollingTimer) window.clearInterval(state.pollingTimer);
        state.pollingTimer = window.setInterval(function () {
          if (document.visibilityState === "visible") loadLocalItems(false);
        }, 10000);
      }

      function updateCountdowns() {
        document.querySelectorAll("[data-expires]").forEach(function (node) {
          var expiresAt = Number(node.getAttribute("data-expires"));
          if (!expiresAt) return;
          node.textContent = formatRemaining(expiresAt);
        });

        var before = state.items.length;
        state.items = state.items.filter(function (item) { return Number(item.expiresAt) > Date.now(); });
        if (state.items.length !== before) renderLocalItems();
      }

      function formatRemaining(expiresAt) {
        var seconds = Math.max(0, Math.ceil((Number(expiresAt) - Date.now()) / 1000));
        if (seconds <= 0) return "Expired";
        var days = Math.floor(seconds / 86400);
        if (days >= 1) return "Expires in " + days + "d " + Math.floor((seconds % 86400) / 3600) + "h";
        var hours = Math.floor(seconds / 3600);
        if (hours >= 1) return "Expires in " + hours + "h " + Math.floor((seconds % 3600) / 60) + "m";
        var minutes = Math.floor(seconds / 60);
        var remainder = seconds % 60;
        if (minutes >= 1) return "Expires in " + minutes + "m " + remainder + "s";
        return "Expires in " + remainder + "s";
      }

      function formatDuration(seconds) {
        var value = Math.max(1, Number(seconds || 0));
        if (value % 86400 === 0) return (value / 86400) + (value === 86400 ? " day" : " days");
        if (value % 3600 === 0) return (value / 3600) + (value === 3600 ? " hour" : " hours");
        if (value % 60 === 0) return (value / 60) + (value === 60 ? " minute" : " minutes");
        return value + " seconds";
      }

      function formatDate(value) {
        var date = new Date(Number(value || 0));
        return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
      }

      function updateCounters() {
        el.titleCounter.textContent = el.shareTitle.value.length + " / " + APP.maxTitleLength;
        el.textCounter.textContent = el.shareText.value.length.toLocaleString() + " / " + APP.maxTextLength.toLocaleString();
      }

      function resetCreateForm() {
        el.createForm.reset();
        el.pinFieldWrap.classList.add("hidden");
        el.sharePin.type = "password";
        updateCounters();
      }

      function upsertLocalItem(item, optimistic) {
        state.items = state.items.filter(function (entry) { return entry.id !== item.id; });
        state.items.unshift(item);
        if (optimistic) {
          state.optimisticItems[item.id] = { item: item, addedAt: Date.now() };
        }
      }

      function reconcileLocalItems(remoteItems) {
        var now = Date.now();
        var merged = [];
        var seen = Object.create(null);

        remoteItems.forEach(function (item) {
          if (!item || !item.id || Number(item.expiresAt) <= now || seen[item.id]) return;
          if (!item.source) item.source = getDeleteToken(item.id) ? "mine" : "received";
          if (!item.addedAt) item.addedAt = item.createdAt;
          seen[item.id] = true;
          merged.push(item);
          if (state.optimisticItems[item.id]) delete state.optimisticItems[item.id];
        });

        Object.keys(state.optimisticItems).forEach(function (itemId) {
          var pending = state.optimisticItems[itemId];
          if (!pending || !pending.item || Number(pending.item.expiresAt) <= now) {
            delete state.optimisticItems[itemId];
            return;
          }
          if (!seen[itemId]) {
            seen[itemId] = true;
            merged.push(pending.item);
          }
        });

        merged.sort(function (a, b) { return Number(b.addedAt || b.createdAt) - Number(a.addedAt || a.createdAt); });
        return merged.slice(0, APP.maxLocalItems || 50);
      }

      function renderLinkedText(container, value) {
        var text = String(value || "");
        var linkPattern = /(?:https?|ftp):\/\/[^\s<>"']+|\/\/[^\s<>"']+|www\.[^\s<>"']+|mailto:[^\s<>"']+|(?:tel|sms):\+?[0-9][0-9(). -]{5,}?[0-9](?=\s+(?:[a-z]|(?:\d{1,3}\.){3}\d)|[.,!?;:]?(?:\s|$))|[a-z0-9.!#$%&'*+/=?^_{|}~-]+@(?:[a-z0-9-]+\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})|(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d{1,5})?(?:[/?#][^\s<>"']*)?|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})(?::\d{1,5})?(?:[/?#][^\s<>"']*)?/gi;
        var lastIndex = 0;
        var match;

        container.textContent = "";
        while ((match = linkPattern.exec(text)) !== null) {
          if (match.index > lastIndex) {
            container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
          }

          var rawUrl = match[0];
          var trimmed = trimLinkPunctuation(rawUrl);
          rawUrl = trimmed.url;

          var safeHref = toSafeLinkHref(rawUrl);
          if (rawUrl && safeHref) {
            var link = document.createElement("a");
            link.href = safeHref;
            link.target = "_blank";
            link.rel = "noopener noreferrer nofollow";
            link.textContent = rawUrl;
            link.title = "Open link in a new tab";
            container.appendChild(link);
          } else if (rawUrl) {
            container.appendChild(document.createTextNode(rawUrl));
          }
          if (trimmed.trailing) {
            container.appendChild(document.createTextNode(trimmed.trailing));
          }
          lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
          container.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
      }

      function trimLinkPunctuation(value) {
        var url = String(value || "");
        var trailing = "";
        var pairs = { ")": "(", "]": "[", "}": "{" };

        while (/[.,!?;:]$/.test(url)) {
          trailing = url.slice(-1) + trailing;
          url = url.slice(0, -1);
        }

        while (/[)\]}]$/.test(url)) {
          var closer = url.slice(-1);
          var opener = pairs[closer];
          var openCount = url.split(opener).length - 1;
          var closeCount = url.split(closer).length - 1;
          if (closeCount <= openCount) break;
          trailing = closer + trailing;
          url = url.slice(0, -1);
        }

        return { url: url, trailing: trailing };
      }

      function toSafeLinkHref(value) {
        var raw = String(value || "").trim();
        if (!raw) return "";

        if (/^mailto:/i.test(raw)) {
          return isEmailAddress(raw.slice(7)) ? raw : "";
        }
        if (/^tel:/i.test(raw)) {
          return /^tel:\+?[0-9][0-9(). -]{5,}[0-9]$/i.test(raw) ? raw : "";
        }
        if (/^sms:/i.test(raw)) {
          return /^sms:\+?[0-9][0-9(). -]{5,}[0-9]$/i.test(raw) ? raw : "";
        }
        if (isEmailAddress(raw)) return "mailto:" + raw;

        var href = raw;
        if (/^\/\//.test(raw)) {
          href = (window.location.protocol === "http:" ? "http:" : "https:") + raw;
        } else if (/^www\./i.test(raw)) {
          href = "https://" + raw;
        } else if (/^(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d{1,5})?(?:[/?#]|$)/i.test(raw)) {
          href = "http://" + raw;
        } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
          href = "https://" + raw;
        }

        try {
          var parsed = new URL(href);
          if (!/^(?:https?:|ftp:)$/i.test(parsed.protocol)) return "";
          if (!parsed.hostname) return "";

          if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname)) {
            var parts = parsed.hostname.split(".");
            if (parts.some(function (part) { return Number(part) > 255; })) return "";
          }
          return parsed.href;
        } catch (error) {
          return "";
        }
      }

      function isEmailAddress(value) {
        return /^[a-z0-9.!#$%&'*+/=?^_{|}~-]+@(?:[a-z0-9-]+\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(String(value || ""));
      }

      function normalizeCode(value) {
        return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
      }

      function focusSection(sectionId, inputId) {
        var section = document.getElementById(sectionId);
        var input = document.getElementById(inputId);
        if (section) section.scrollIntoView({ behavior: "smooth", block: "center" });
        if (input) window.setTimeout(function () { input.focus(); }, 500);
      }

      function fieldError(field, message) {
        toast(message, "error");
        field.focus();
        field.classList.add("border-red-500/70", "ring-2", "ring-red-500/10");
        window.setTimeout(function () {
          field.classList.remove("border-red-500/70", "ring-2", "ring-red-500/10");
        }, 1800);
      }

      function setButtonLoading(button, loading, label) {
        button.disabled = loading;
        var labelNode = button.querySelector("[data-button-label]");
        var icon = button.querySelector("[data-button-icon]");
        if (labelNode) labelNode.textContent = label;
        if (icon) icon.classList.toggle("animate-pulse", loading);
      }

      function togglePassword(input) {
        input.type = input.type === "password" ? "text" : "password";
        input.focus();
      }

      async function copyText(value, successMessage) {
        if (!value) return toast("Nothing to copy.", "error");
        try {
          await navigator.clipboard.writeText(String(value));
          toast(successMessage || "Copied.", "success");
        } catch (error) {
          var temp = document.createElement("textarea");
          temp.value = String(value);
          temp.style.position = "fixed";
          temp.style.opacity = "0";
          document.body.appendChild(temp);
          temp.select();
          document.execCommand("copy");
          temp.remove();
          toast(successMessage || "Copied.", "success");
        }
      }

      function toast(message, type) {
        var container = document.getElementById("toast-container");
        var item = document.createElement("div");
        var isError = type === "error";
        item.className = "toast-enter pointer-events-auto flex items-start gap-3 rounded-md border p-3 shadow-2xl " + (isError
          ? "border-red-500/25 bg-[#2a1b1b] text-red-100"
          : "border-violet-500/25 bg-[#242033] text-violet-100");

        var dot = document.createElement("span");
        dot.className = "mt-1 h-2.5 w-2.5 shrink-0 rounded-full " + (isError ? "bg-red-400" : "bg-violet-400");
        var text = document.createElement("p");
        text.className = "flex-1 text-sm leading-6";
        text.textContent = message;
        var close = document.createElement("button");
        close.type = "button";
        close.className = "text-current opacity-50 transition hover:opacity-100";
        close.textContent = "×";
        close.addEventListener("click", function () { item.remove(); });

        item.appendChild(dot);
        item.appendChild(text);
        item.appendChild(close);
        container.appendChild(item);
        window.setTimeout(function () { item.remove(); }, 4500);
      }

      function ownerTokenMap() {
        try {
          var parsed = JSON.parse(localStorage.getItem("airtext_owner_tokens") || "{}");
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
          return {};
        }
      }

      function saveDeleteToken(itemId, token) {
        var map = ownerTokenMap();
        map[itemId] = token;
        localStorage.setItem("airtext_owner_tokens", JSON.stringify(map));
      }

      function getDeleteToken(itemId) {
        return ownerTokenMap()[itemId] || "";
      }

      function removeDeleteToken(itemId) {
        var map = ownerTokenMap();
        delete map[itemId];
        localStorage.setItem("airtext_owner_tokens", JSON.stringify(map));
      }

      function lockBodyScroll() {
        document.documentElement.classList.add("overflow-hidden");
      }

      function unlockBodyScrollIfClear() {
        var anyOpen = [el.itemModal, el.fileModal, el.qrModal, el.scannerModal].some(function (modal) {
          return !modal.classList.contains("hidden");
        });
        if (el.drawer && el.drawer.classList.contains("open")) anyOpen = true;
        if (!anyOpen) document.documentElement.classList.remove("overflow-hidden");
      }
    })();
  </script>
</body>
</html>`;

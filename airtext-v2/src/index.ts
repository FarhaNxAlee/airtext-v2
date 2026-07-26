import { Hono } from "hono";
import type { Env } from "./types";
import { maybeCleanupD1 } from "./middleware/cleanup";
import { notesRoutes } from "./routes/notes";
import { filesRoutes } from "./routes/files";
import { feedbackRoutes } from "./routes/feedback";
import { adminRoutes } from "./routes/admin";
import { usersRoutes } from "./routes/users";
import { meRoutes } from "./routes/me";
import { seoRoutes } from "./routes/seo";
import { jsonError } from "./lib/http";
import { getSiteSettings } from "./lib/settings";
import { normalizeShareCode, normalizePath, escapeHtml } from "./lib/util";
import { CONFIG } from "./lib/config";
import { renderPage } from "./html";

/** Ported from airtext-worker-modern.js:246-437 (route dispatcher) + :987-995 (setup check). */

function getSetupProblem(env: Env): string {
  if (!env.DB) {
    return "Missing D1 database binding named DB. Bind your airtext D1 database using the variable name DB.";
  }
  if (!env.APP_SECRET || String(env.APP_SECRET).length < 24) {
    return "Missing or weak APP_SECRET. Add a secret named APP_SECRET with at least 24 random characters.";
  }
  return "";
}

/** Ported verbatim from airtext-worker-modern.js:2694-2726. */
function renderSetupPage(problem: string): string {
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
      <p>4. Run the database migrations so the <code>users</code>/<code>roles</code> tables and an admin account exist.</p>
      <p>5. Deploy the Worker again.</p>
    </div>
  </main>
</body>
</html>`;
}

/** Ported verbatim from airtext-worker-modern.js:2724-2726. */
function renderRuntimeErrorPage(message = "Something went wrong."): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AirText</title><style>body{background:#141410;color:#f5f5f5;font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}.box{max-width:620px;background:#1d1d19;border:1px solid #34342d;border-radius:12px;padding:32px}h1{margin-top:0;color:#c9f31d}a{color:#c9f31d}</style></head><body><div class="box"><h1>${escapeHtml(message)}</h1><p><a href="/">Return to AirText</a></p></div></body></html>`;
}

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(self), microphone=(), geolocation=()",
  "content-security-policy": [
    // 'unsafe-inline' is required for the boot-data and theme-detect
    // <script> tags injected directly into <head> (see src/html.ts) --
    // same requirement the v1 CSP had. Unlike v1, no CDN is allow-listed
    // since main.js/qrcode/html5-qrcode are all self-hosted now.
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline'",
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

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const setupProblem = getSetupProblem(c.env);
  if (setupProblem) {
    return c.html(renderSetupPage(setupProblem), 500);
  }
  await maybeCleanupD1(c.env);
  await next();
});

app.get("/favicon.ico", (c) => c.body(null, 204));

app.route("/", seoRoutes);
app.route("/", notesRoutes);
app.route("/", filesRoutes);
app.route("/", feedbackRoutes);
app.route("/", adminRoutes);
app.route("/", usersRoutes);
app.route("/", meRoutes);

app.get("*", async (c) => {
  const url = new URL(c.req.url);
  const path = normalizePath(url.pathname);

  const codeMatch = path.match(/^\/s\/([A-Za-z0-9]{4,12})$/);
  const fileCodeMatch = path.match(/^\/f\/([A-Za-z0-9]{4,12})$/);
  const initialShareCode = codeMatch ? normalizeShareCode(codeMatch[1]) : "";
  const initialFileShareCode = fileCodeMatch ? normalizeShareCode(fileCodeMatch[1]) : "";
  const initialShareVia: "link" | "qr" = url.searchParams.get("via") === "qr" ? "qr" : "link";
  const initialAdmin = path === "/admin";

  if (path !== "/" && !initialShareCode && !initialFileShareCode && !initialAdmin) {
    return new Response(renderRuntimeErrorPage("Page not found."), { status: 404, headers: HTML_HEADERS });
  }

  const settings = await getSiteSettings(c.env);
  const html = renderPage(settings, {
    initialShareCode,
    initialFileShareCode,
    initialShareVia,
    initialAdmin,
    minPinLength: CONFIG.MIN_PIN_LENGTH,
    maxPinLength: CONFIG.MAX_PIN_LENGTH,
    canonicalPath: path,
    requestOrigin: url.origin,
  });
  return new Response(html, { status: 200, headers: HTML_HEADERS });
});

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return jsonError("API route not found.", 404);
  }
  return new Response(renderRuntimeErrorPage("Page not found."), { status: 404, headers: HTML_HEADERS });
});

app.onError((error, c) => {
  console.error("Unhandled Worker error", error);
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return jsonError("Unexpected server error.", 500);
  }
  return new Response(renderRuntimeErrorPage(), { status: 500, headers: HTML_HEADERS });
});

export default app;

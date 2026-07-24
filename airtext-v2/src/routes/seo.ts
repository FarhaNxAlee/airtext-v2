import { Hono } from "hono";
import type { Env } from "../types";
import { getSiteSettings } from "../lib/settings";
import { escapeHtml } from "../lib/util";

/** Ported verbatim from airtext-worker-modern.js:2651-2679. */

export const seoRoutes = new Hono<{ Bindings: Env }>();

seoRoutes.get("/robots.txt", async (c) => {
  const settings = await getSiteSettings(c.env);
  const url = new URL(c.req.url);
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
});

seoRoutes.get("/sitemap.xml", async (c) => {
  const settings = await getSiteSettings(c.env);
  const url = new URL(c.req.url);
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
});

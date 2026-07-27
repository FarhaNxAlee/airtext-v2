import { Hono } from "hono";
import type { Env } from "../types";
import { getSiteSettings } from "../lib/settings";
import { jsonResponse, jsonError, readJsonBody } from "../lib/http";
import { randomBase64Url } from "../lib/crypto";
import { getClientIpHash } from "../middleware/auth";
import { enforceCooldown } from "../middleware/rateLimit";
import { recordEvent } from "../lib/analytics";

/** Ported verbatim from airtext-worker-modern.js:2295-2326. */

export const feedbackRoutes = new Hono<{ Bindings: Env }>();

feedbackRoutes.post("/api/feedback", async (c) => {
  const env = c.env;
  const settings = await getSiteSettings(env);
  if (!settings.feedbackEnabled) {
    return jsonError("Feedback is currently disabled.", 403, "FEEDBACK_DISABLED");
  }
  const body = await readJsonBody<{ category?: string; message?: string; email?: string; rating?: number }>(
    c.req.raw,
    6_000,
  );
  if (!body.ok) return body.response;
  const allowedCategories = ["bug", "suggestion", "design", "other", "account_request"];
  const category = allowedCategories.includes(body.data.category as string) ? (body.data.category as string) : "other";
  const message = typeof body.data.message === "string" ? body.data.message.trim() : "";
  const email = typeof body.data.email === "string" ? body.data.email.trim().slice(0, 200) : "";
  const rating = Math.max(0, Math.min(5, Number(body.data.rating || 0)));
  if (message.length < 5 || message.length > 2_000) {
    return jsonError("Feedback must be between 5 and 2,000 characters.", 400, "INVALID_FEEDBACK");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("Enter a valid email address or leave it empty.", 400, "INVALID_EMAIL");
  }
  const clientHash = await getClientIpHash(c.req.raw, env.APP_SECRET);
  const cooldown = await enforceCooldown(env, `feedback:${clientHash}`, 60);
  if (!cooldown.allowed) {
    return jsonError(`Please wait ${cooldown.retryAfter} seconds before submitting again.`, 429, "FEEDBACK_RATE_LIMIT");
  }
  const id = randomBase64Url(12);
  const createdAt = Date.now();
  await env.DB.prepare(
    `INSERT INTO feedback (id, category, message, email, rating, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'new', ?)`,
  )
    .bind(id, category, message, email, Number.isFinite(rating) ? rating : 0, createdAt)
    .run();
  await recordEvent(env, c.req.raw, "feedback_submitted", { category });
  return jsonResponse({ ok: true, message: "Thank you. Your feedback has been submitted." }, 201);
});

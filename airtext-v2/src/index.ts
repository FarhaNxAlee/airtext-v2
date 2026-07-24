import { Hono } from "hono";
import type { Env } from "./types";
import { maybeCleanupD1 } from "./middleware/cleanup";
import { notesRoutes } from "./routes/notes";
import { filesRoutes } from "./routes/files";
import { feedbackRoutes } from "./routes/feedback";
import { adminRoutes } from "./routes/admin";
import { seoRoutes } from "./routes/seo";
import { jsonError } from "./lib/http";

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

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const setupProblem = getSetupProblem(c.env);
  if (setupProblem) {
    return c.text(setupProblem, 500);
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

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return jsonError("API route not found.", 404);
  }
  // TODO(Phase 3): serve the real app shell (renderPage) for "/", "/admin",
  // "/s/:code", "/f/:code" once the client port lands. Until then this
  // route intentionally has no HTML page so it's obvious it's incomplete.
  return c.text("AirText v2 backend is up. HTML shell not ported yet (Phase 3).", 501);
});

app.onError((error, c) => {
  console.error("Unhandled Worker error", error);
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return jsonError("Unexpected server error.", 500);
  }
  return c.text("Something went wrong.", 500);
});

export default app;

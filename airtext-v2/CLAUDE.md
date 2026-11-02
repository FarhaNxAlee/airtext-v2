# AirText V3 — Project Guide for Claude

This file is the onboarding doc for a fresh Claude Code session working on this repo. Read it before making changes.

## What this is

**AirText** is a temporary text/file sharing web app — create a drop (text or file), get a short code/link/QR, open it on another device, and it disappears automatically. Live at **https://air4share.farhanwebuse.workers.dev**.

It started as a single-file Cloudflare Worker (`airtext-worker-modern.js`, "V1" — see `../` one level up, kept for reference/history), was rebuilt into a modular Hono app with accounts/roles/multi-file sharing ("V2"), and has since gone through a **V3 rewrite** (see `V3-PLAN.md` in this folder for the full plan): real per-page routing and SEO, a trimmed/reorganized admin-editable settings surface, a renamed product vocabulary ("Drop"/"Nearby"/"Receive"/"Open once"), a tier-based visual identity for logged-in users, and a fully rebuilt admin panel. V1 and the pre-V3 single-shell V2 structure are no longer live; this repo is the only thing running in production.

**V3 is deployed and live** (as of 2026-07-26): migrations `0003_role_rename.sql` and `0004_audit_log.sql` are applied to production D1, the Worker is deployed, and a pre-deploy backup exists at `../backups/airtext-pre-v3-20260726-225743.sql`. The V3 rewrite landed in git as commit `64cb875` ("airtext-v2: V3 rewrite -- real routing, tier system, admin revamp, bug fixes") on 2026-07-27 — `git log`/`git diff` now reflect it.

## Tech stack

- **Cloudflare Workers** (runtime) + **Hono** (routing, `src/index.ts` composes route modules with `app.route("/", xRoutes)`)
- **D1** (SQLite) for all persistent data — mostly accessed via raw `env.DB.prepare(...)` for fidelity/control, though `src/db/schema.ts` has a hand-written Drizzle schema mirroring the migrations
- **R2** for uploaded file bytes (`FILES_BUCKET` binding)
- **KV** for rate-limit cooldown counters (`SHARE_KV` binding)
- **Vite** builds the client (`client/main.js` + `client/style.css` + `client/copy.js`, Tailwind v4) into `dist/assets/*`, served via Workers Static Assets (`ASSETS` binding). **Important**: `npm run dev` only runs this build *once* at startup (`build:client && wrangler dev`) — it is not watched. Any edit to `client/*` requires `npx vite build` (or restarting `npm run dev`) before the browser sees it; editing `src/*.ts` alone does get picked up live by `wrangler dev`.
- **Vanilla JS client** — no framework. DOM built by hand via `document.createElement`, a single global `data-action` click-delegation handler, a cached `el.*` object, an in-memory `state.*` object, and `window.__AIRTEXT_BOOT__` (server-injected boot data, aliased to `APP` in `main.js`)
- **Vitest** + `@cloudflare/vitest-pool-workers` — tests run against the real Workers runtime (`SELF.fetch`, `env` from `cloudflare:test`), not mocks
- **Wrangler** for dev/deploy. `wrangler.jsonc`'s `name: "air4share"` targets the real, already-live Worker and its real D1/R2/KV — `wrangler dev` uses local simulated copies by default; only `wrangler deploy` (or `npm run deploy`) touches production.

## Repository layout

```
src/
  index.ts            Hono app entry, route composition, the catch-all "*" handler that
                       renders per-route HTML (see "Routes reference" below)
  html.ts             Shared shell (nav, icon sprite, footer, modals) + one content function per
                       route + renderPage() + ROUTE_SEO map + boot data
  types.ts            Env bindings interface
  db/
    schema.ts         Drizzle schema (mirrors the migrations, mostly for reference/tooling)
    client.ts         Drizzle client factory
  lib/
    crypto.ts         HMAC-SHA256 hashing for PINs/passwords/delete-tokens/sessions (all purpose-
                       prefixed HMACs off one APP_SECRET — see "Crypto model" below)
    settings.ts       SiteSettings type + DEFAULT_SETTINGS (~59 keys, see "Settings" below) +
                       getSiteSettings() (D1-backed, admin-editable)
    limits.ts         EffectiveLimits type + getEffectiveLimits() (role/custom-limits merge) +
                       sanitizePartialLimits() (validates admin-supplied limit overrides)
    audit.ts          recordAudit() — writes to the audit_log table for admin-panel actions
    config.ts         Static config constants (PIN length bounds, session duration, etc.)
    http.ts           jsonResponse/jsonError/readJsonBody helpers
    analytics.ts      recordEvent() — privacy-safe event logging (hashed IPs, no raw addresses)
    r2.ts             R2 helpers for file storage
    util.ts           escapeHtml, safeJsonForScript, misc
  middleware/
    auth.ts            Session cookie (__Host-airtext_session, HMAC-signed, exp+nonce), getSession(),
                       getAuthenticatedUser(), requireRole(maxRank), createSessionToken(), buildSessionCookie()
    rateLimit.ts       enforceCooldown() — KV-backed per-key cooldown windows
    cleanup.ts         Expired-row cleanup helpers
  routes/
    notes.ts           Text note create/open/unlock/delete (anonymous + authenticated), GET /api/local/count
    files.ts           File-group (multi-file batch) create/open/unlock/download/delete
    admin.ts           Admin-only (rank 0) auth + overview/drops/feedback/audit/bulk-delete + settings
    users.ts           Admin-only user & role CRUD (paginated/searchable)
    me.ts              Any-account auth (login/logout/session) + "My Drops" dashboard API
    feedback.ts        Public feedback submission (also backs the /account "request an account" form)
    seo.ts             robots.txt / sitemap.xml
client/
  main.js              The entire client app (single IIFE, ~3500 lines) — see "Client architecture" below
  copy.js              COPY object — micro-copy (nav labels, placeholders, badges, guide/FAQ strings)
                       that used to live in admin-editable settings; moved to code in the V3 settings cut
  style.css            Tailwind v4 + custom CSS (tier system, admin sidebar, drop cards, modals, etc.)
  public/              Vite publicDir — manifest.webmanifest, icon.svg (served as-is, not built)
migrations/
  0000_baseline.sql       Original V1 schema equivalent (notes, files, network_*, feedback, site_settings)
  0001_accounts.sql       roles + users tables, user_id FK added to notes/files, burn_after_read,
                          client-encryption columns
  0002_file_groups.sql    file_groups table (multi-file batch sharing), files.group_id FK
  0003_role_rename.sql    Renames role display names: rank 1 "Contributor"->"Pro", rank 2 "Pro"->"Member"
                          (rank 0 "Admin" unchanged) -- data-only, no schema change
  0004_audit_log.sql      audit_log table + composite indexes on notes/file_groups/feedback/users for
                          the admin panel's paginated/searchable views
test/                  Vitest suite, one file per route module roughly, run against the real Workers runtime
.claude/launch.json    Dev-server config for the Browser-pane preview tooling (npm run dev on :8787)
V3-PLAN.md             Full V3 rewrite plan (phases, rationale, sequencing) -- read this for "why"
                       behind the routing/settings/admin restructure
```

## Vocabulary (V3)

The product noun is **Drop** (a note or a file share, unified). User-facing copy uses: **Nearby** (was "Available on this network"), **Receive** (was "Open code"), **Open once** (was "Burn after reading"), **Wi-Fi** (was "Network"). Role display names: rank 0 = **Admin**, rank 1 = **Pro** (was "Contributor"), rank 2 = **Member** (was "Pro") — see `migrations/0003_role_rename.sql`. Don't reintroduce the old terms in new user-facing strings; internal identifiers (table/column names, route paths like `/api/local/items`) were left alone.

## Settings (`src/lib/settings.ts`)

`DEFAULT_SETTINGS` was cut from ~150 keys to **~59** as part of V3 (see `V3-PLAN.md` section 2 for the full rationale and before/after key lists). Two tiers remain admin-editable via `/admin` → Settings:
- **Operational** (~27 keys): TTLs, size/count caps, cooldowns, feature toggles, maintenance mode, announcement.
- **Brand/marketing** (~32 keys): app name, tagline, hero copy, footer tagline, about/developer info, social links, SEO fields.

Everything else (nav labels, placeholders, button text, guide/FAQ copy, badges, empty-state strings — ~101 keys) moved to **`client/copy.js`**'s `COPY` object as plain hardcoded strings. If you need a new user-facing string: default to adding it to `copy.js`, not back to `DEFAULT_SETTINGS` — only add a new settings key if it's genuinely something an admin needs to tune per-deployment (a limit, a toggle, or real brand copy), not a UI label.

## Routes reference

```
Public HTML pages (src/index.ts catch-all "*", content per-route via src/html.ts):
  /              Landing page (hero, in-hero quick-share card, live Wi-Fi count, FAQ teaser, etc.)
  /text          Send text
  /files         Send files
  /nearby        What's on this Wi-Fi (Text section + Files section, each with a "Share text/files ->" button)
  /receive       Enter a code / scan QR
  /qr            Standalone QR-for-any-link generator
  /guide         How it works + Text-vs-Files tips
  /faq           FAQ accordion + FAQPage JSON-LD
  /about
  /privacy, /terms
  /login         Unified front door (posts to /api/auth/login; shows an admin-panel hint for rank 0)
  /account       Sign-in card + "why sign in" benefits (logged out) or "My Drops" dashboard (logged in)
  /admin         Admin panel (sidebar IA -- see below)
  /s/:code       Opens a text share (via link/QR) -- UNCHANGED path shape since V1/V2, printed QR codes rely on it
  /f/:code       Opens a file share (via link/QR) -- same

Public JSON API (anonymous-capable):
  GET/POST /api/items, /api/local/items, /api/local/item/:id, /api/local/item/:id/unlock
  GET      /api/local/count                                     (live nearby-drop count for the homepage strip)
  GET/POST /api/share/:code, /api/share/:code/unlock          (open a received text share)
  DELETE   /api/item/:itemId
  GET/POST /api/files, /api/local/files, /api/local/file/:groupId, /api/local/file/:groupId/unlock
  GET/POST /api/share/file/:code, /api/share/file/:code/unlock
  GET      /api/file/:fileId/download
  DELETE   /api/file/:groupId
  POST     /api/feedback                                       (categories incl. "account_request")
  GET      /robots.txt, /sitemap.xml

Non-admin account auth + dashboard ("/account" backend):
  GET  /api/auth/session
  POST /api/auth/login, /api/auth/logout
  GET  /api/me/shares
  PATCH /api/me/password
  DELETE /api/me/shares/notes/:noteId, /api/me/shares/files/:groupId

Admin-only ("/admin" backend, requireRole(...,0), mutations also require the x-airtext-admin header):
  GET/POST /api/admin/session, /api/admin/login, /api/admin/logout
  GET      /api/admin/dashboard                                 (legacy, still used by nothing new -- kept)
  GET      /api/admin/overview                                  (stats + 7-day trends + needs-attention)
  GET      /api/admin/drops?page&pageSize&q&type&filter&sort     (unified paginated notes+files)
  POST     /api/admin/drops/bulk-delete
  GET      /api/admin/feedback?page&pageSize&status&category
  GET      /api/admin/audit?page&pageSize&actor&action
  PATCH    /api/admin/settings
  DELETE   /api/admin/item/:itemId, /api/admin/file/:fileId
  PATCH/DELETE /api/admin/feedback/:feedbackId
  GET/POST /api/admin/users (paginated via ?page&pageSize&q&role&status), PATCH/DELETE /api/admin/users/:userId
  GET      /api/admin/roles, PATCH /api/admin/roles/:roleId
```

## Feature set (all shipped and live)

1. **Anonymous text/file sharing** — create a drop or upload file(s), get a code/link/QR, opens on any device, auto-expires. No account needed.
2. **Real per-page routing** — every page above has its own `<title>`/meta description/canonical (`ROUTE_SEO` map in `src/html.ts`), not a single shell with hidden tab panels.
3. **Accounts & roles** — `Admin` (rank 0, hardcoded generous limits) → `Pro` (rank 1) → `Member` (rank 2) → Anonymous (no row). Admin-only account creation (no public signup). Each role has admin-editable default limits (JSON) + name; admin can also set a `custom_limits` JSON override per individual user via a real per-field form (no more raw-JSON textarea).
4. **Unified auth, unified front door** — one `users` table; `/login` posts to the any-rank endpoint and redirects to `/account` (or hints at the admin panel for rank 0). `/admin` keeps its own separate rank-0-only login form (see "Auth model").
5. **Multi-file batch sharing** — one upload can contain several files under one share code.
6. **Tier visual identity** — signed-in users get an avatar (initials + deterministic hue) with a rank-based ring (`Admin` gold, `Pro` violet, `Member` solid accent) and a matching badge, shown in the nav, `/account`, admin Users, and next to `sharedBy` on Nearby-list rows. Only Admin-owned rows get the extra card glow treatment.
7. **Burn-after-reading, now "Open once"** — first *received* open deletes the row; the creator's own view never burns their own drop.
8. **Vanity/custom share codes** — Pro/Member users (`allowCustomCode`) can pick their own code.
9. **Client-side encryption** — for PIN-locked notes, if `allowClientEncryption` is set, the client derives an AES-GCM key from the PIN before the text leaves the browser.
10. **"My Drops" dashboard** (`/account`, logged in) — avatar/role card, plan limits in plain English (not a raw key dump), drops list with inline copy-link/QR/delete, change-password form.
11. **Admin panel** (`/admin`) — sidebar IA (Overview / Drops / Users / Inbox / Settings), trend-aware KPIs + a "needs attention" queue on Overview, a unified paginated/searchable/bulk-deletable Drops view (merges notes+files), a real per-field limits editor on Users, Inbox splitting general feedback from account requests (with an "Approve -> prefill create-account form" handoff), and a Settings page broken into sub-sections instead of one long form. Every mutating action writes to `audit_log` via `recordAudit()`.
12. **PWA basics** — manifest + icon, paste-anywhere and drag-anywhere-to-share, Web Share API button in the post-create QR modal, client-side expiry chooser on create forms (server-clamped via an optional `ttlSeconds` field).

Explicitly **out of scope / dropped**: Contributor leaderboard (gamification), Turnstile anti-abuse (considered, not implemented — would use the `turnstile-spin` skill if picked up later).

## Data model (D1)

- **`roles`**: `id, rank (0=admin/1=pro/2=member, unique), name, is_system, default_limits (JSON), created_at`
- **`users`**: `id, email (unique), password_salt, password_hash, display_name, role_id → roles, custom_limits (nullable JSON), status ('active'|'disabled'), created_at, last_login_at`
- **`notes`**: text shares. Nullable `user_id → users`, `burn_after_read`, `body_encrypted`, `encryption_iv`, plus title/text/locked/pin_salt/pin_hash/code/delete_token_hash/created_at/expires_at
- **`file_groups`**: one row per share code, even for a single file. `id, room_id, user_id → users (nullable), title, locked, pin_salt/pin_hash, code (unique), delete_token_hash, total_size_bytes, burn_after_read, created_at, expires_at`
- **`files`**: individual file rows, `group_id → file_groups` (`ON DELETE CASCADE`)
- **`network_notes` / `network_files`**: per-network visibility join tables (network_files points at `group_id`)
- **`feedback`**: `id, category ('bug'|'suggestion'|'design'|'other'|'account_request'), message, email, rating, status ('new'|'reviewed'|'resolved'), created_at`
- **`site_settings`**: single-row key/value-ish table backing `SiteSettings` (~59 keys, see "Settings" above)
- **`audit_log`** (new in V3): `id, actor_user_id, actor_email, action, target_type, target_id, before_json, after_json, ip_hash, created_at` — written by `recordAudit()` from every admin mutation, read by `GET /api/admin/audit`

Production had 0 rows in `files`/`network_files` at the time of the multi-file cutover.

## Auth model

Two **intentionally separate** login systems sharing the same `users` table — do not merge them:

- **`/api/admin/login`** (`src/routes/admin.ts`) — rank-0-only. Backs `/admin`. Rejects any non-admin account even with correct credentials.
- **`/api/auth/login`** (`src/routes/me.ts`) — any active account, any rank. Backs `/login` and `/account`. This is what Pro/Member users use; admins can also use it but normally use `/admin` instead.

Both issue the same `__Host-airtext_session` cookie shape (HMAC-signed `{sub, rank, exp, nonce}`, see `middleware/auth.ts`). `getAuthenticatedUser(request, env)` is the shared helper both admin and non-admin routes use. `requireRole(request, env, maxRank)` gates admin-only routes (`requireAdmin = requireRole(..., 0)`).

## Crypto model (`src/lib/crypto.ts`)

Everything is one HMAC-SHA256 primitive (`hmacHex(secret, message)`) off a single `APP_SECRET`, with the *purpose* baked into a prefix on the message so the same secret+salt can never collide across uses:
- `pin:${salt}:${pin}` — note/file-group PIN hashing
- `password:${salt}:${password}` — user account passwords
- `enc-key:${salt}:${pin}` — client-side encryption key derivation
- delete-token and session-signing use their own analogous prefixes

No bcrypt/scrypt — deliberate, to keep continuity with the original V1 pattern.

## Client architecture (`client/main.js`)

Single IIFE, no framework. Key structures:
- `APP` = `window.__AIRTEXT_BOOT__`, server-injected on every page load — contains site settings (the ~59 surviving keys), the current viewer's effective limits, `viewer` (`{displayName, roleName, rank}` or null), and routing flags (`initialAdmin`, `initialAccount`, `initialShareCode`, etc.)
- `COPY` — imported from `client/copy.js`, holds the micro-copy that used to be admin-editable settings
- `state.*` — in-memory client state; `el.*` — cached DOM element references, built once in `cacheElements()` (null-guarded throughout, since most elements only exist on *some* pages now that routing is per-page, not one shared shell with hidden panels)
- A single delegated `document.addEventListener("click", ...)` dispatches on `data-action` attributes — this is how nearly every button works. New buttons should follow this pattern.
- `/admin` and `/account` still render as full alternate sections toggled via `.hidden-force` based on `initialAdmin`/`initialAccount` boot flags (unlike the other pages, which get their own dedicated `__MAIN_CONTENT__` inside the shared public shell) — `/account`'s content now lives *inside* `#public-app`'s shared header/footer as of the V3 fix (it used to be its own separate mini-shell with a different header and no footer; don't reintroduce that split).
- Tier avatar/badge helpers (`hashHue`, `getInitials`, `tierRingClass`, `tierBadgeClass`, `tierBadgeIcon`) are defined in both `src/html.ts` (server-rendered instances: nav avatar, `/account` header) and mirrored in `client/main.js` (client-rendered instances: drawer, Nearby-list `sharedBy` badges) — keep them in sync if the tier logic changes.
- `apiFetch(url, options)` — generic JSON fetch wrapper; `adminFetch` adds the `x-airtext-admin` mutation header admin write routes require
- Reusable helpers worth knowing before adding UI: `showQr(code, link)`, `toast(message, type)`, `fieldError(field, message)`, `formatDuration`, `formatBytes`, `formatRemaining`, `copyText`

## Conventions to follow

- **Raw SQL over Drizzle ORM calls** in route handlers. The Drizzle schema exists for reference/tooling (`db:generate`, `db:studio`).
- **New admin-only routes**: gate with `requireRole(request, env, 0)` (or `requireAdmin`), require the `x-airtext-admin` header on mutations, and call `recordAudit()` for anything that changes state — see any existing `admin.ts`/`users.ts` mutation for the pattern.
- **New per-user routes** (like `/api/me/*`): gate with `getAuthenticatedUser(request, env)`, scope every query by `WHERE user_id = ?`.
- **New settings fields**: ask first whether it's genuinely admin-tunable (a limit/toggle/brand copy — goes in `DEFAULT_SETTINGS`) or a fixed UI label (goes in `client/copy.js`). Don't grow `DEFAULT_SETTINGS` back toward its pre-V3 size.
- **New pages**: add a content function in `src/html.ts` (`pageXContent()`), a case in `getMainContentForPath()`, an entry in `ROUTE_SEO`, and a route-recognition check in `src/index.ts`'s catch-all (`PUBLIC_CONTENT_ROUTES` or equivalent) — reuse the shared shell (`SITE_HEADER`/`SITE_FOOTER`/icon sprite), don't build a new one-off header.
- **Client build step**: remember `client/*` changes need `npx vite build` before they're visible — `wrangler dev` does not watch/rebuild them.
- **CSS specificity gotcha**: a `:has(#id.class)` selector carries the specificity of whatever's inside the parentheses, including IDs — this bit us once (a footer responsive-collapse rule got permanently overridden by a `:has()` rule with an ID inside it). If you add a conditional layout rule, check whether a `:has()` selector elsewhere could out-specificity it regardless of media query.
- **Deploying**: `npm run deploy` builds the client then runs `wrangler deploy` — this touches the live production Worker and its real D1/R2/KV. Treat it as a risky/confirm-first action; the established discipline is backup → local verify (typecheck + `npx vitest run`) → apply any pending D1 migrations → deploy → smoke-check the live URL.
- **Schema changes**: write a new numbered migration file in `migrations/`, mirror it in `src/db/schema.ts`, and export a fresh D1 backup (`wrangler d1 export airtext --remote`) before applying to production.
- **Local dev DB** (`wrangler dev` / `.claude/launch.json`'s `airtext-v2-dev` config) is a separate local D1 simulation from production — seed test users directly via `wrangler d1 execute DB --local --command "..."` when you need to manually verify a flow in the browser.

## Testing

`npm run test` (or `npx vitest run`) runs the full suite against the real Workers runtime via `@cloudflare/vitest-pool-workers` — not against mocks. As of the last update: **97 tests across 10 files**, all passing (includes `test/html-routes.test.ts`, covering the new per-route SEO/rendering and the FAQPage JSON-LD). Login-related tests need ~3.1s delays between attempts in the same test file to clear the rate-limiter — follow that pattern for any new login-flow test rather than fighting the cooldown.

## Known gaps / not yet done

- Turnstile anti-abuse (create/upload/feedback forms) — considered, not implemented.
- No email infrastructure — admin sets a new user's password directly, no invite-link flow.
- No "resend/forgot password" flow for Pro/Member accounts (by design, for now) — only self-service change-password while logged in (`PATCH /api/me/password`), plus admin-driven reset via the Users "Edit" form.
- `GET /api/admin/drops` doesn't project `burn_after_read` per-row (only usable as a filter today), so the "Open once" badge can only render when that filter is active rather than always — flagged as a small follow-up.
- Homepage hero title/subtitle/buttons still show pre-V3 wording in production — they're admin-editable `site_settings` values (Tier 2, see "Settings" above), and the old stored values persist across deploys by design. Update via `/admin` → Settings → Content, or reset those specific keys to `DEFAULT_SETTINGS` directly if picked up in a new session.
- (Resolved 2026-07-27) The V3 rewrite is now committed as `64cb875`, giving a clean diff/rollback point.

## Where to find more

- `V3-PLAN.md` (this folder) — the full V3 rewrite plan: phases, rationale, before/after settings-key lists, sequencing.
- `../V2-PLAN.md` (one level up) — the original V1→V2 migration plan, for historical context.
- Git log on this repo (`git log --oneline`) — every phase landed as its own commit with descriptive messages.

# AirText v2 — Local Development Plan

## What AirText Does (Full Feature Reference)

### Public Site (No Account Required)

| Feature | How it works |
|---|---|
| **Text notes** | Create a temp note, optional PIN lock, auto-expires |
| **File sharing** | Upload any file (size-capped), same temp/expiry model as notes |
| **Local board** | Auto-shows all notes/files on the same public IP/network |
| **Cross-network share** | Code, full link, or QR — opens on any device anywhere |
| **PIN unlock** | Locked notes/files require the correct PIN to read |
| **Owner delete** | Browser localStorage token — only the creator can delete |
| **QR scanner** | Camera-based scan of a share code QR |
| **QR for any link** | Paste any URL → instant QR (client-side, zero server) |
| **Auto cleanup** | D1 rows + R2 blobs purged after TTL expires |
| **Themes** | Light, dark, system preference |
| **Deep links** | `/s/CODE` opens a note, `/f/CODE` opens a file directly |

### Admin Panel (`/admin`)

| Tab | What you manage |
|---|---|
| **Overview** | 7-day chart, event counts, unique networks |
| **Notes** | All active notes with delete |
| **Files** | All active files, R2 storage bar, delete |
| **Feedback** | User submissions, status management |
| **Settings** | Every setting below, live without redeploying |

Admin-configurable settings groups:
- General: site name, tagline, TTL, max items, cooldowns, theme default
- Content copy: every public-facing label, heading, button, and placeholder
- File sharing limits: enabled toggle, max file size (MB), total storage cap (MB), retention, upload cooldown, max active files, allowed/blocked extensions
- QR link tool: enabled toggle, all copy
- SEO: title tag, meta description, keywords, OG image, Twitter handle, canonical URL, Google site verification, robots directive
- Toggles: notes, PIN, cross-network, feedback, analytics, maintenance mode, hero, sections, footer, etc.

### SEO Routes
- `/robots.txt` — generated from admin-controlled robots directive
- `/sitemap.xml` — listing the homepage and any public pages

---

## V1 Architecture (Current — Quick Edit)

```
airtext-worker-modern.js   ← single file, ~6,200 lines
├── CONFIG                 ← hard-coded runtime limits
├── DEFAULT_SETTINGS       ← all admin-configurable values
├── sanitizeSettings()     ← validates any incoming PATCH to /api/admin/settings
├── ensureD1Schema()       ← CREATE TABLE IF NOT EXISTS (run on first request)
├── Route dispatcher       ← path/method if-else chain
├── D1 handlers            ← notes, files, feedback, analytics, rate limits
├── Admin handlers         ← session, dashboard, settings, delete
├── renderAppPage()        ← builds the full HTML string with injected settings
├── buildSeoHeadExtras()   ← OG/Twitter/canonical/structured-data tags
├── APP_HTML               ← ~3,000-line HTML+CSS+JS template literal
└── Client-side IIFE       ← all frontend logic (vanilla JS, no bundler)
```

**Deployment:** paste into Cloudflare's Quick Edit → Save and Deploy. No local tooling needed.

**Bindings required:**
- `DB` → D1 database named `airtext`
- `FILES_BUCKET` → R2 bucket (file sharing, optional — rest of site works without it)
- `APP_SECRET` → secret (≥24 chars)
- `ADMIN_PASSWORD` → secret

---

## V2 Architecture (Wrangler / Local Dev)

### Technology Choices

| Layer | Choice | Why |
|---|---|---|
| **Runtime** | Cloudflare Workers | Same platform, no change |
| **HTTP framework** | **Hono** | Built for Workers, real routing/middleware, tiny bundle, TypeScript-first |
| **ORM** | **Drizzle ORM** | Type-safe D1 access, versioned SQL migrations, zero extra runtime deps |
| **Frontend** | **Vanilla TS + Vite** | Keep it light. No React/Svelte needed — your UI is already well-designed; Vite bundles it properly and replaces the Tailwind CDN script tag |
| **CSS** | **Tailwind CSS (PostCSS/Vite)** | Same classes you use now, but built at compile time — not the browser runtime CDN script |
| **Testing** | **Vitest + @cloudflare/vitest-pool-workers** | Tests run inside the actual Workers runtime with real D1/R2 bindings |
| **Deployment** | **Wrangler CLI** | `wrangler dev` locally, `wrangler deploy` to Cloudflare |
| **CI/CD** | **GitHub Actions** | Auto-deploy to staging on PR merge, production on release tag |

### Project Structure

```
airtext-v2/
│
├── src/
│   ├── index.ts                    ← Hono app entry point, exported Worker
│   │
│   ├── db/
│   │   ├── schema.ts               ← Drizzle schema (all 8 tables)
│   │   └── client.ts               ← drizzle(env.DB) helper
│   │
│   ├── routes/
│   │   ├── notes.ts                ← GET/POST /api/local/items, /api/items, etc.
│   │   ├── files.ts                ← GET/POST /api/files, /api/file/:id, download
│   │   ├── share.ts                ← GET /api/share/:code, /api/share/file/:code
│   │   ├── feedback.ts             ← POST /api/feedback
│   │   ├── admin.ts                ← all /api/admin/* routes (session, settings, etc.)
│   │   └── seo.ts                  ← GET /robots.txt, /sitemap.xml
│   │
│   ├── middleware/
│   │   ├── auth.ts                 ← requireAdmin(), session cookie verify
│   │   ├── rateLimit.ts            ← D1-backed cooldown (replaces d1EnforceCooldown)
│   │   └── cleanup.ts              ← periodic expired note/file/R2 purge
│   │
│   ├── lib/
│   │   ├── crypto.ts               ← hmacHex, hashPin, randomBase64Url, constantTimeEqual
│   │   ├── settings.ts             ← getSiteSettings(), sanitizeSettings(), DEFAULT_SETTINGS
│   │   ├── seo.ts                  ← buildSeoHeadExtras(), injectMetaTags()
│   │   └── r2.ts                   ← R2 upload, signed download token, delete
│   │
│   ├── types.ts                    ← Cloudflare Env bindings interface
│   └── html.ts                     ← renderPage() — server-renders HTML shell with settings
│
├── client/
│   ├── main.ts                     ← app bootstrap, init, bindEvents
│   ├── state.ts                    ← shared reactive state object
│   ├── notes.ts                    ← create, list, open, unlock, delete note
│   ├── files.ts                    ← upload, list, open, unlock, download, delete file
│   ├── qr.ts                       ← QR generation (notes, files, standalone link tool)
│   ├── scanner.ts                  ← camera QR scanning
│   ├── admin/
│   │   ├── dashboard.ts            ← load, render, refresh
│   │   ├── tabs.ts                 ← switchTab(), tab state
│   │   ├── files-panel.ts          ← storage bar, file list, admin delete
│   │   ├── settings-form.ts        ← fillAdminSettings(), renderContentFields()
│   │   └── feedback-panel.ts       ← status update, delete
│   ├── ui/
│   │   ├── toast.ts
│   │   ├── modal.ts
│   │   ├── drawer.ts
│   │   └── theme.ts
│   └── style.css                   ← Tailwind base + your custom CSS vars
│
├── public/
│   └── favicon.ico
│
├── test/
│   ├── setup.ts
│   ├── notes.test.ts               ← create, list, unlock, delete (Workers runtime)
│   ├── files.test.ts               ← upload, download token, delete, R2 cleanup
│   ├── admin.test.ts               ← auth, settings PATCH, rate limits
│   └── crypto.test.ts              ← hmacHex, constantTimeEqual, hashPin
│
├── migrations/
│   └── 0001_initial.sql            ← generated by `npm run db:generate`
│
├── package.json
├── wrangler.jsonc                  ← staging + production envs, D1 + R2 bindings
├── tsconfig.json
├── vite.config.ts                  ← builds client/ → dist/assets/
├── drizzle.config.ts
├── vitest.config.ts
├── .dev.vars                       ← local secrets (gitignored)
├── .dev.vars.example               ← template for team members
├── .gitignore
└── README.md
```

---

## Local Setup — Step by Step

### Prerequisites
- Node.js 18+ (22 recommended)
- npm 10+
- Git
- A Cloudflare account (free tier works for D1 + R2)

### 1. Clone and install

```bash
git clone https://github.com/your-username/airtext-v2.git
cd airtext-v2
npm install
```

### 2. Authenticate Wrangler

```bash
npx wrangler login
# Opens browser → log in with your Cloudflare account
```

### 3. Create your D1 databases

```bash
# Staging
npx wrangler d1 create airtext-staging

# Production
npx wrangler d1 create airtext-production
```

Copy the `database_id` values printed by each command into `wrangler.jsonc`
under `env.staging.d1_databases[0].database_id` and
`env.production.d1_databases[0].database_id`.

For local `wrangler dev` you don't need a real database_id —
Wrangler creates a local SQLite file automatically.

### 4. Create your R2 buckets

```bash
npx wrangler r2 bucket create airtext-files-staging
npx wrangler r2 bucket create airtext-files-production
```

### 5. Set secrets

```bash
# Staging
npx wrangler secret put APP_SECRET --env staging
npx wrangler secret put ADMIN_PASSWORD --env staging

# Production
npx wrangler secret put APP_SECRET --env production
npx wrangler secret put ADMIN_PASSWORD --env production
```

For local dev, create `.dev.vars` (never commit this file):
```
APP_SECRET=your-local-secret-at-least-24-chars
ADMIN_PASSWORD=your-local-admin-password
```

### 6. Generate and apply migrations

```bash
# Generate migration SQL from Drizzle schema
npm run db:generate

# Apply to local SQLite (wrangler dev uses this)
npm run db:migrate:local

# Apply to staging D1
npm run db:migrate:staging

# Apply to production D1 (after testing staging)
npm run db:migrate:production
```

### 7. Build the client (one-time and on client changes)

```bash
npm run build:client
# Vite compiles client/ → dist/assets/
```

Or watch mode during development:
```bash
npm run build:client -- --watch
```

### 8. Run locally

```bash
npm run dev
# wrangler dev — serves at http://localhost:8787
# Hot-reloads Worker code on save
# Uses local D1 SQLite and mocked R2
```

Admin panel: http://localhost:8787/admin

---

## Deployment

### Deploy to staging

```bash
npm run deploy:staging
# wrangler deploy --env staging
# → live at airtext-staging.<your-account>.workers.dev
```

### Deploy to production

```bash
npm run deploy:production
# wrangler deploy --env production
```

### Gradual rollout (after first stable production deploy)

Once you have a v2 in production and want to ship a risky change safely:

```bash
# Upload new version WITHOUT switching all traffic to it
npx wrangler versions upload --env production

# Shift 10% of traffic to new version (keep 90% on old)
npx wrangler versions deploy --env production
# → prompts for version IDs and percentages

# Monitor → if good, push to 100%
# If bad, rollback by pushing 0% to new version instantly
```

---

## CI/CD — GitHub Actions

`.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [main]       # → staging
  release:
    types: [published]     # → production

jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run build:client
      - run: npx wrangler deploy --env staging
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}

  deploy-production:
    if: github.event_name == 'release'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run build:client
      - run: npx wrangler deploy --env production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
```

---

## V1 → V2: Improvements You Get

| Pain point in v1 | How v2 fixes it |
|---|---|
| 6,200-line single file — impossible to navigate | Split into ~20 focused modules |
| No TypeScript — typos in column names cause runtime errors | Full TypeScript — schema, routes, middleware, client all typed |
| Hand-written SQL strings with manual column-order checks | Drizzle generates type-safe query builders from schema.ts |
| Schema migrations = `CREATE TABLE IF NOT EXISTS` at runtime | Versioned SQL files in `migrations/` — applied once via Wrangler |
| No tests — every change is a leap of faith | `@cloudflare/vitest-pool-workers` — tests run in the real Workers runtime |
| Tailwind CDN runtime — slow, not tree-shaken, dev-only tool | Vite builds Tailwind at compile time — production-grade, smaller CSS |
| Quick Edit only — no local dev, no diff, no rollback | Full local dev with `wrangler dev`, Git history, staging environment |
| Admin settings save requires manual grep to add new fields | Drizzle schema change → migration → TypeScript catches everything else |
| Gradual deploys impossible | Workers Versions API — shift traffic 10% → 50% → 100% |
| No spam protection on forms | Cloudflare Turnstile on create/upload forms |
| Rate limiting done inside Worker CPU | Cloudflare WAF rules hit before the Worker runs |

---

## V2 Features to Add (Not in V1)

These aren't in v1 and make sense to build properly in v2:

### Optional Accounts (magic-link only)
- Sign up with email → magic link → session cookie (HMAC-signed, same pattern as admin)
- Logged-in users get: higher file size cap, longer retention, named "vault" board
- No passwords, no OAuth complexity — just email + HMAC token
- Drizzle adds a `users` table and `user_sessions` table in a single migration

### Cloudflare Turnstile
- Add to: note create form, file upload form, feedback form
- Server-side verify in the Hono route middleware before touching D1
- Free, invisible mode (no CAPTCHA puzzle for users)

### Cloudflare WAF Rate Limiting
- Add in Cloudflare dashboard → Security → WAF → Rate Limiting
- Rule: >20 POST requests to `/api/items` or `/api/files` per IP per minute → block
- This runs before your Worker, so your D1 rate_limits table becomes a second line, not the first

### R2 Presigned Uploads (for larger files)
- v1: Worker proxies the file bytes through itself (CPU/memory limit risk on large files)
- v2: Worker issues a presigned R2 PUT URL → browser uploads directly to R2 → Worker only records the metadata
- Enables larger file caps without hitting Worker memory limits

### D1 Time Travel (Backups)
- Enable in Cloudflare D1 dashboard → automatic restore to any point in last 30 days
- Protects against accidental data loss or bad migrations

---

## Package.json Scripts Reference

```bash
npm run dev                 # wrangler dev — local server at localhost:8787
npm run build:client        # Vite builds client/ → dist/assets/
npm run deploy:staging      # deploy to airtext-staging
npm run deploy:production   # deploy to airtext-production
npm run typecheck           # tsc --noEmit across all TS files
npm run db:generate         # drizzle-kit generate — produces migrations/XXXX.sql
npm run db:migrate:local    # apply migrations to local SQLite
npm run db:migrate:staging  # apply migrations to staging D1
npm run db:migrate:production # apply migrations to production D1
npm run db:studio           # drizzle-kit studio — visual DB browser at localhost:4983
npm run test                # vitest run — tests inside Workers runtime
npm run test:watch          # vitest — watch mode
```

---

## Secrets Checklist

| Secret name | Where | What |
|---|---|---|
| `APP_SECRET` | Wrangler secret | ≥32 random chars — signs session cookies, delete tokens, HMAC |
| `ADMIN_PASSWORD` | Wrangler secret | Admin panel password |
| `CF_API_TOKEN` | GitHub repo secret | Used by GitHub Actions to call `wrangler deploy` |

Never put secrets in `wrangler.jsonc` or commit `.dev.vars`.

---

## Wrangler.jsonc Bindings Summary

```jsonc
{
  "d1_databases": [{ "binding": "DB", ... }],
  "r2_buckets": [{ "binding": "FILES_BUCKET", ... }],
  // Secrets are set via `wrangler secret put`, NOT in this file
}
```

The `Env` TypeScript interface in `src/types.ts` must match these binding names:
```typescript
export interface Env {
  DB: D1Database;
  FILES_BUCKET: R2Bucket;
  APP_SECRET: string;
  ADMIN_PASSWORD: string;
  ENVIRONMENT?: string;
}
```

---

*AirText v2 — Hono + Drizzle ORM + Vite + Wrangler*

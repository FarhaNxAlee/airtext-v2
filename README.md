# AirText

A temporary text and file sharing web app — create a **drop** (a note or a file), get a short code, link, or QR code, open it on another device, and it disappears on its own. No account required.

**Live:** [air4share.farhanwebuse.workers.dev](https://air4share.farhanwebuse.workers.dev)

## What's in this repo

- **`airtext-v2/`** — the current production app: a Cloudflare Workers backend (Hono + D1 + R2 + KV) with a vanilla-JS client, accounts and roles, multi-file sharing, an admin panel, and more. See [`airtext-v2/CLAUDE.md`](airtext-v2/CLAUDE.md) for the full technical writeup and [`airtext-v2/V3-PLAN.md`](airtext-v2/V3-PLAN.md) for the rationale behind the current architecture.
- **`airtext-worker-modern.js`** — the original single-file Cloudflare Worker ("V1"), kept for reference/history. No longer deployed.
- **`V2-PLAN.md`** — the original V1 → V2 migration plan, for historical context.

## Features

- Anonymous, no-account text and file sharing — create a drop, share a code/link/QR, it expires automatically
- Optional PIN protection, "open once" (deletes itself the instant it's opened), and custom/vanity share codes
- Multi-file batch uploads under a single share code
- Accounts with three tiers — **Admin**, **Pro**, **Member** — each with configurable limits (retention time, file size caps, batch size, custom codes, browser encryption)
- A "Nearby" view of everything currently shared on your Wi-Fi, and a "My Drops" dashboard for signed-in users
- A full admin panel — usage overview with trends, a unified searchable/paginated view of all drops, user management, a feedback/account-request inbox, site settings, and an audit log
- Optional browser AES-256-GCM text encryption with a random key carried in the complete share link, on top of PIN/password hashing that's all HMAC-SHA256 off a single server secret (no raw secrets ever stored)
- A PWA manifest, paste-anywhere and drag-anywhere sharing, and a Web Share API button on mobile

## Tech stack

Cloudflare Workers · Hono · D1 (SQLite) · R2 · KV · Vite · Tailwind CSS v4 · Vitest (`@cloudflare/vitest-pool-workers`, tests run against the real Workers runtime, not mocks) · vanilla JavaScript client (no framework)

## Getting started

```bash
cd airtext-v2
npm install
npm run dev       # builds the client once, then starts wrangler dev on :8787 against local D1/R2/KV
```

Running the test suite:

```bash
npm run test
```

**Note:** `npm run dev` only builds `client/main.js`/`client/style.css` once at startup — it isn't watched. After editing anything under `client/`, run `npx vite build` (or restart `npm run dev`) before the change shows up in the browser.

## Deploying

```bash
npm run deploy     # builds the client, then runs `wrangler deploy`
```

This targets the real, already-live Cloudflare Worker and its production D1/R2/KV — not a local sandbox. Back up the production D1 database first (`wrangler d1 export airtext --remote`), apply any pending migrations (`wrangler d1 migrations apply DB --remote`), then deploy, then smoke-check the live URL. You'll need your own `wrangler.jsonc` bindings and a Cloudflare account with a D1 database, R2 bucket, and KV namespace set up, plus an `APP_SECRET` set via `wrangler secret put APP_SECRET`.

## License

No license has been chosen yet for this project.

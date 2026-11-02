# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This repo contains three generations of the same app, only one of which is live:

- **`airtext-v2/`** — the current production app and the only thing actually deployed. Has its own `CLAUDE.md` with full architecture, commands, and conventions — **read `airtext-v2/CLAUDE.md` before making any code changes**; nearly all real work happens inside this directory.
- **`airtext-worker-modern.js`** (repo root) — the original single-file Cloudflare Worker ("V1"), kept for reference/history only. No build step, no longer deployed. Do not edit unless explicitly asked to work on V1.
- **`V2-PLAN.md`** (repo root) — the historical V1→V2 migration plan. `airtext-v2/V3-PLAN.md` is the more relevant/current plan doc for the current architecture.
- **`backups/`** — D1 SQL dump backups taken before risky migrations/deploys.
- **`DEPLOY-README.md`** — deploy checklist for the old V1 worker (dashboard-paste deploy flow), not applicable to `airtext-v2`.

There is no root-level `package.json` — this root is just a container for the three generations plus historical docs. All npm/wrangler commands must be run from inside `airtext-v2/`.

## Quick reference (see `airtext-v2/CLAUDE.md` for full detail)

```bash
cd airtext-v2
npm install
npm run dev         # builds client once, then wrangler dev on :8787 (local D1/R2/KV)
npx vite build       # rebuild client after editing client/* -- npm run dev does NOT watch it
npm run test         # vitest run, real Workers runtime via @cloudflare/vitest-pool-workers
npm run typecheck
npm run deploy       # builds client + wrangler deploy -- touches the LIVE production Worker/D1/R2/KV
```

**Live app:** https://air4share.farhanwebuse.workers.dev

For architecture (routing, data model, auth model, crypto model, client structure, admin panel, settings system, conventions), route reference, and known gaps, go straight to `airtext-v2/CLAUDE.md` — it is kept current and far more detailed than a root-level summary could stay.
